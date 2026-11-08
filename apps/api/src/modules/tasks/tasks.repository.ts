import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  ProjectMemberRole,
  type TaskPriority,
  type TaskStatus,
} from '../../generated/prisma/enums.js';

type CreateTaskData = {
  projectId: string;
  reporterId: string;
  title: string;
  description: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId: string | null;
  startDate: Date | null;
  dueDate: Date | null;
};

type UpdateTaskData = {
  projectId: string;
  taskId: string;
  userId: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  startDate?: Date | null;
  dueDate?: Date | null;
};

type DeleteTaskData = {
  projectId: string;
  taskId: string;
  userId: string;
};

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(projectId: string) {
    return this.prisma.task.findMany({
      where: { projectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        assignee: { select: { id: true, name: true } },
        reporter: { select: { id: true, name: true } },
      },
    });
  }

  findById(projectId: string, taskId: string) {
    return this.prisma.task.findUnique({
      where: {
        id: taskId,
        projectId,
      },
      include: {
        assignee: { select: { id: true, name: true } },
        reporter: { select: { id: true, name: true } },
      },
    });
  }

  findProjectMember(projectId: string, userId: string) {
    return this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
  }

  async create(data: CreateTaskData) {
    try {
      // 採番とTask作成を同じtransactionで行う。途中で例外が起きたら、両方の更新を取り消す。
      return await this.prisma.$transaction(async (tx) => {
        // 1. 対象Projectのアーカイブ状態を取得し、このtransactionが終わるまで行をロックする。
        // 同じProjectをロックするメンバー削除・role変更や、アーカイブの更新と保存順を揃える。
        const [project] = await tx.$queryRaw<{ isArchived: boolean }[]>`
          SELECT is_archived AS "isArchived"
          FROM projects
          WHERE id = ${data.projectId}
          FOR UPDATE
        `;

        // Projectが取得できなければ、以降の検証・保存は行わない。
        if (!project) {
          return { status: 'project_not_found' as const };
        }

        // 2. タスク作成者本人の参加情報を、Project IDとUser IDの組み合わせで取得する。
        // reporterIdはServiceが設定した認証済み本人のUser ID。
        // Serviceの事前確認後に脱退・role変更された場合も、ロック後の最新状態で判断する。
        const member = await tx.projectMember.findUnique({
          where: {
            projectId_userId: {
              projectId: data.projectId,
              userId: data.reporterId,
            },
          },
        });
        if (!member) {
          // 非参加者には、Projectが存在しない場合と同じ結果を返す。
          return { status: 'project_not_found' as const };
        }
        if (member.role === ProjectMemberRole.viewer) {
          // viewerは閲覧のみ。タスクを作成できるのはowner・member。
          return { status: 'forbidden' as const };
        }
        if (project.isArchived) {
          // 作成権限があっても、アーカイブ済みProjectへの作成は許可しない。
          return { status: 'project_archived' as const };
        }

        // 3. 担当者が指定された場合だけ、そのUserが同じProjectに参加しているか確認する。
        // assigneeIdは担当者のUser ID。未担当（null）の場合は、この検証をスキップする。
        // 担当者にはowner・member・viewerのいずれも指定できるため、roleの制限はしない。
        if (data.assigneeId !== null) {
          const assignee = await tx.projectMember.findUnique({
            where: {
              projectId_userId: {
                projectId: data.projectId,
                userId: data.assigneeId,
              },
            },
          });
          if (!assignee) {
            // 指定Projectの参加情報がないUserは、担当者として保存できない。
            return { status: 'assignee_not_found' as const };
          }
        }

        // 4. 対象ProjectのカウンターをDB上で1増やし、更新後のlastTaskNumberだけを取得する。
        // 例: カウンターが2なら3に更新し、今回のタスク番号として3を使う。
        const counter = await tx.project.update({
          where: { id: data.projectId },
          data: { lastTaskNumber: { increment: 1 } },
          select: { lastTaskNumber: true },
        });

        // 5. ...dataで保存項目を展開し、Backendで採番したnumberを加えてTaskを1件作成する。
        // この作成に失敗した場合は、直前のカウンター増加も同じtransactionで取り消される。
        const task = await tx.task.create({
          data: { ...data, number: counter.lastTaskNumber },
          // 関連する担当者・報告者のUserも取得し、作成結果にidとnameだけを含める。
          include: {
            assignee: { select: { id: true, name: true } },
            reporter: { select: { id: true, name: true } },
          },
        });

        // 6. 成功を表すstatusと、作成したTaskをServiceへ返す。
        // このあとtransactionが正常終了すると、カウンター更新とTask作成が一緒に確定する。
        return { status: 'created' as const, task };
      });
    } catch (error) {
      // 一意制約違反もtransactionの外で扱い、カウンター更新を確実に取り消す。
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = error.meta?.target;
        // Prismaのpg adapterはtargetの代わりに、原因のindex名を返す場合がある。
        const adapterError = error.meta?.driverAdapterError as
          { cause?: { constraint?: { index?: string } } } | undefined;
        if (
          (Array.isArray(target) &&
            target.includes('project_id') &&
            target.includes('number')) ||
          adapterError?.cause?.constraint?.index ===
            'tasks_project_id_number_key'
        ) {
          return { status: 'number_conflict' as const };
        }
      }
      throw error;
    }
  }

  update(data: UpdateTaskData) {
    return this.prisma.$transaction(async (tx) => {
      // メンバー削除・role変更・アーカイブと、同じProjectの保存順を揃える。
      const [project] = await tx.$queryRaw<{ isArchived: boolean }[]>`
        SELECT is_archived AS "isArchived"
        FROM projects
        WHERE id = ${data.projectId}
        FOR UPDATE
      `;
      if (!project) {
        return { status: 'project_not_found' as const };
      }

      // userIdは認証済みの実行者。報告者とは分け、ロック後の参加資格で判断する。
      const member = await tx.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: data.projectId,
            userId: data.userId,
          },
        },
      });
      if (!member) {
        return { status: 'project_not_found' as const };
      }
      if (member.role === ProjectMemberRole.viewer) {
        return { status: 'forbidden' as const };
      }
      if (project.isArchived) {
        return { status: 'project_archived' as const };
      }

      const task = await tx.task.findUnique({
        where: { id: data.taskId, projectId: data.projectId },
        include: {
          assignee: { select: { id: true, name: true } },
          reporter: { select: { id: true, name: true } },
        },
      });
      if (!task) {
        return { status: 'task_not_found' as const };
      }

      // 省略は担当を維持し、nullは担当解除。User IDを指定したときだけ参加情報を確認する。
      if (data.assigneeId !== undefined && data.assigneeId !== null) {
        const assignee = await tx.projectMember.findUnique({
          where: {
            projectId_userId: {
              projectId: data.projectId,
              userId: data.assigneeId,
            },
          },
        });
        if (!assignee) {
          return { status: 'assignee_not_found' as const };
        }
      }

      // 片方だけの変更も、ロック後の最新の日付と合わせて検証する。
      // ??ではnullも現在値に戻ってしまうため、undefinedだけを省略として扱う。
      const startDate =
        data.startDate !== undefined ? data.startDate : task.startDate;
      const dueDate = data.dueDate !== undefined ? data.dueDate : task.dueDate;
      if (startDate && dueDate && dueDate.getTime() < startDate.getTime()) {
        return { status: 'invalid_date_range' as const };
      }

      // 今回指定された項目に、保存済みのTaskと異なる値が1つでもあるかチェック。
      const hasChanges =
        (data.title !== undefined && data.title !== task.title) ||
        (data.description !== undefined &&
          data.description !== task.description) ||
        (data.status !== undefined && data.status !== task.status) ||
        (data.priority !== undefined && data.priority !== task.priority) ||
        (data.assigneeId !== undefined &&
          data.assigneeId !== task.assigneeId) ||
        (data.startDate !== undefined &&
          data.startDate?.getTime() !== task.startDate?.getTime()) ||
        (data.dueDate !== undefined &&
          data.dueDate?.getTime() !== task.dueDate?.getTime());
      if (!hasChanges) {
        // 同じ値なら保存せず、updatedAtも維持する。
        return { status: 'unchanged' as const, task };
      }

      const updatedTask = await tx.task.update({
        where: { id: data.taskId, projectId: data.projectId },
        // 指定された7項目だけを書き込み、番号・報告者・採番カウンターは変更しない。
        data: {
          ...(data.title !== undefined && { title: data.title }),
          ...(data.description !== undefined && {
            description: data.description,
          }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.priority !== undefined && { priority: data.priority }),
          ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
          ...(data.startDate !== undefined && { startDate: data.startDate }),
          ...(data.dueDate !== undefined && { dueDate: data.dueDate }),
        },
        include: {
          assignee: { select: { id: true, name: true } },
          reporter: { select: { id: true, name: true } },
        },
      });

      return { status: 'updated' as const, task: updatedTask };
    });
  }

  delete(data: DeleteTaskData) {
    return this.prisma.$transaction(async (tx) => {
      // メンバー削除・role変更・アーカイブと、同じProjectの保存順を揃える。
      const [project] = await tx.$queryRaw<{ isArchived: boolean }[]>`
        SELECT is_archived AS "isArchived"
        FROM projects
        WHERE id = ${data.projectId}
        FOR UPDATE
      `;
      if (!project) {
        return { status: 'project_not_found' as const };
      }

      // userIdは認証済みの実行者。報告者とは分け、ロック後の参加資格で判断する。
      const member = await tx.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: data.projectId,
            userId: data.userId,
          },
        },
      });
      if (!member) {
        return { status: 'project_not_found' as const };
      }
      if (member.role !== ProjectMemberRole.owner) {
        return { status: 'forbidden' as const };
      }
      if (project.isArchived) {
        return { status: 'project_archived' as const };
      }

      const task = await tx.task.findUnique({
        where: { id: data.taskId, projectId: data.projectId },
      });
      if (!task) {
        return { status: 'task_not_found' as const };
      }

      await tx.task.delete({
        where: { id: data.taskId, projectId: data.projectId },
      });

      return { status: 'deleted' as const };
    });
  }
}
