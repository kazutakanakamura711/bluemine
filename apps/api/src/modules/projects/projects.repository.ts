import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProjectMemberRole } from '../../generated/prisma/enums.js';

type CreateProjectData = {
  ownerId: string;
  name: string;
  key: string;
  description?: string;
};

type UpdateProjectData = {
  name?: string;
  description?: string | null;
};

type CreateProjectMemberData = {
  projectId: string;
  userId: string;
  role: Exclude<ProjectMemberRole, typeof ProjectMemberRole.owner>;
};

type UpdateProjectMemberRoleData = {
  projectId: string;
  projectMemberId: string;
  role: Exclude<ProjectMemberRole, typeof ProjectMemberRole.owner>;
};

type DeleteProjectMemberData = {
  projectId: string;
  projectMemberId: string;
};

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.project.findMany({
      where: {
        projectMembers: {
          some: { userId },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  findById(id: string) {
    return this.prisma.project.findUnique({
      where: { id },
    });
  }

  findByIdForMember(id: string, userId: string) {
    return this.prisma.project.findUnique({
      where: {
        id,
        projectMembers: {
          some: { userId },
        },
      },
      include: {
        projectMembers: {
          where: { userId },
          select: { role: true },
        },
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

  findProjectMemberById(projectId: string, projectMemberId: string) {
    return this.prisma.projectMember.findUnique({
      where: {
        id: projectMemberId,
        projectId,
      },
    });
  }

  async findProjectMembers(projectId: string) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    // DB の参加日時・ID 順を保ち、owner だけを先頭にまとめる。
    return [
      ...members.filter((member) => member.role === ProjectMemberRole.owner),
      ...members.filter((member) => member.role !== ProjectMemberRole.owner),
    ];
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
      },
    });
  }

  create(data: CreateProjectData) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Project を作成する。
      const project = await tx.project.create({
        data: data,
      });

      // 2. 作成者を owner の参加情報として登録する。
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: data.ownerId,
          role: ProjectMemberRole.owner,
        },
      });

      // 両方成功したら、作成した Project を返す。
      return project;
    });
  }

  createProjectMember(data: CreateProjectMemberData) {
    return this.prisma.$transaction(async (tx) => {
      // メンバーの保存まで Project 行をロックし、アーカイブとの競合を防ぐ。
      const [project] = await tx.$queryRaw<{ isArchived: boolean }[]>`
        SELECT is_archived AS "isArchived"
        FROM projects
        WHERE id = ${data.projectId}
        FOR UPDATE
      `;

      if (!project) {
        return { status: 'project_not_found' as const };
      }

      if (project.isArchived) {
        return { status: 'project_archived' as const };
      }

      const member = await tx.projectMember.create({
        data,
        select: {
          id: true,
          userId: true,
          role: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      return { status: 'created' as const, member };
    });
  }

  updateProjectMemberRole(data: UpdateProjectMemberRoleData) {
    return this.prisma.$transaction(async (tx) => {
      // role の確認から保存まで Project 行をロックし、アーカイブや同時変更と順序を揃える。
      const [project] = await tx.$queryRaw<{ isArchived: boolean }[]>`
        SELECT is_archived AS "isArchived"
        FROM projects
        WHERE id = ${data.projectId}
        FOR UPDATE
      `;

      if (!project) {
        return { status: 'project_not_found' as const };
      }

      if (project.isArchived) {
        return { status: 'project_archived' as const };
      }

      const memberSelect = {
        id: true,
        userId: true,
        role: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      } as const;

      // 対象を指定 Project 内に限定し、ロック取得後の最新の role を確認する。
      const member = await tx.projectMember.findUnique({
        where: {
          id: data.projectMemberId,
          projectId: data.projectId,
        },
        select: memberSelect,
      });

      if (!member) {
        return { status: 'member_not_found' as const };
      }

      if (member.role === ProjectMemberRole.owner) {
        return { status: 'owner_protected' as const };
      }

      // 同じ role なら UPDATE せず、参加情報の更新日時も維持する。
      if (member.role === data.role) {
        return { status: 'unchanged' as const, member };
      }

      const updatedMember = await tx.projectMember.update({
        where: {
          id: data.projectMemberId,
          projectId: data.projectId,
        },
        data: { role: data.role },
        select: memberSelect,
      });

      return { status: 'updated' as const, member: updatedMember };
    });
  }

  deleteProjectMember(data: DeleteProjectMemberData) {
    return this.prisma.$transaction(async (tx) => {
      // 状態の確認から削除完了まで Project 行をロックする。
      const [project] = await tx.$queryRaw<{ isArchived: boolean }[]>`
      SELECT is_archived AS "isArchived"
      FROM projects
      WHERE id = ${data.projectId}
      FOR UPDATE
    `;

      if (!project) {
        return { status: 'project_not_found' as const };
      }

      if (project.isArchived) {
        return { status: 'project_archived' as const };
      }

      // 指定 Project 内の参加情報を、ロック取得後に確認する。
      const member = await tx.projectMember.findUnique({
        where: {
          id: data.projectMemberId,
          projectId: data.projectId,
        },
        select: {
          role: true,
          userId: true,
        },
      });

      if (!member) {
        return { status: 'member_not_found' as const };
      }

      if (member.role === ProjectMemberRole.owner) {
        return { status: 'owner_protected' as const };
      }

      // 完了済みも含めて、このProjectで対象Userが担当するTaskだけを未担当に戻す。
      // 参加情報の削除が失敗した場合は、この更新も同じtransactionで取り消す。
      await tx.task.updateMany({
        where: {
          projectId: data.projectId,
          assigneeId: member.userId,
        },
        data: { assigneeId: null },
      });

      await tx.projectMember.delete({
        where: {
          id: data.projectMemberId,
          projectId: data.projectId,
        },
      });

      return { status: 'deleted' as const };
    });
  }

  update(id: string, data: UpdateProjectData) {
    return this.prisma.project.update({
      where: { id },
      data,
    });
  }

  archive(id: string) {
    return this.prisma.project.update({
      where: { id },
      data: {
        isArchived: true,
      },
    });
  }

  unarchive(id: string) {
    return this.prisma.project.update({
      where: { id },
      data: {
        isArchived: false,
      },
    });
  }
}
