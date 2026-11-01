import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Task } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { TasksRepository } from '../src/modules/tasks/tasks.repository.js';

type UpdateTaskData = Parameters<TasksRepository['update']>[0];

// setup-env.tsが選んだ専用DBだけを使用する。Authアカウントは作成しない。
describe('TasksRepository.update', () => {
  let prisma: PrismaService;
  let repository: TasksRepository;
  let ownerId: string;
  let userId: string;
  let assigneeId: string;
  let projectId: string;
  let taskId: string;
  let originalTask: Task;
  let projectIds: string[];
  let userIds: string[];

  beforeAll(() => {
    prisma = new PrismaService();
    repository = new TasksRepository(prisma);
  });

  beforeEach(async () => {
    projectIds = [];
    userIds = [randomUUID(), randomUUID(), randomUUID()];
    [ownerId, userId, assigneeId] = userIds;
    await prisma.user.createMany({
      data: userIds.map((id) => ({
        id,
        email: `task-update-${id}@example.test`,
        name: null,
      })),
    });
    const project = await prisma.project.create({
      data: {
        ownerId,
        name: 'Task update test',
        key: randomUUID(),
        lastTaskNumber: 7,
        projectMembers: {
          create: [
            { userId: ownerId, role: 'owner' },
            { userId, role: 'member' },
            { userId: assigneeId, role: 'viewer' },
          ],
        },
      },
    });
    projectId = project.id;
    projectIds.push(projectId);
    originalTask = await prisma.task.create({
      data: {
        projectId,
        number: 7,
        reporterId: ownerId,
        assigneeId,
        title: 'Original title',
        description: 'Original description',
        status: 'in_progress',
        priority: 'high',
        startDate: new Date('2026-11-10T00:00:00.000Z'),
        dueDate: new Date('2026-11-20T00:00:00.000Z'),
        updatedAt: new Date('2026-10-31T00:00:00.000Z'),
      },
    });
    taskId = originalTask.id;
  });

  afterEach(async () => {
    await prisma.$transaction([
      prisma.task.deleteMany({ where: { projectId: { in: projectIds } } }),
      prisma.projectMember.deleteMany({
        where: { projectId: { in: projectIds } },
      }),
      prisma.project.deleteMany({ where: { id: { in: projectIds } } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function update(changes: Partial<UpdateTaskData>) {
    return repository.update({ projectId, taskId, userId, ...changes });
  }

  function readState() {
    return prisma.project.findMany({
      where: { id: { in: projectIds } },
      orderBy: { id: 'asc' },
      include: {
        tasks: { orderBy: { id: 'asc' } },
        projectMembers: { orderBy: { id: 'asc' } },
      },
    });
  }

  async function expectRejected(
    changes: Partial<UpdateTaskData>,
    status: string,
  ) {
    const before = await readState();
    expect(await update(changes)).toEqual({ status });
    expect(await readState()).toEqual(before);
  }

  it.each(['owner', 'member'] as const)(
    '%sは7項目を更新でき、番号・報告者・Project・参加情報を維持する',
    async (role) => {
      const [before] = await readState();
      const result = await update({
        userId: role === 'owner' ? ownerId : userId,
        title: 'Updated title',
        description: 'Updated description',
        status: 'done',
        priority: 'low',
        assigneeId: ownerId,
        startDate: new Date('2026-11-15T00:00:00.000Z'),
        dueDate: new Date('2026-11-15T00:00:00.000Z'),
      });
      expect(result).toMatchObject({
        status: 'updated',
        task: {
          ...originalTask,
          title: 'Updated title',
          description: 'Updated description',
          status: 'done',
          priority: 'low',
          assigneeId: ownerId,
          assignee: { id: ownerId, name: null },
          reporter: { id: ownerId, name: null },
          startDate: new Date('2026-11-15T00:00:00.000Z'),
          dueDate: new Date('2026-11-15T00:00:00.000Z'),
          updatedAt: expect.any(Date),
        },
      });
      if (result.status !== 'updated') throw new Error('更新失敗');
      expect(result.task.updatedAt.getTime()).toBeGreaterThan(
        originalTask.updatedAt.getTime(),
      );
      expect(Object.keys(result.task.assignee!).sort()).toEqual(['id', 'name']);
      expect(Object.keys(result.task.reporter).sort()).toEqual(['id', 'name']);
      const [{ tasks, ...afterProject }] = await readState();
      const { tasks: _beforeTasks, ...beforeProject } = before;
      expect(afterProject).toEqual(beforeProject);
      const {
        assignee: _assignee,
        reporter: _reporter,
        ...storedTask
      } = result.task;
      expect(tasks).toEqual([storedTask]);
    },
  );

  it('省略・undefinedの項目を維持し、受け取った余分なカラムを書き込まない', async () => {
    const data = {
      projectId,
      taskId,
      userId,
      title: 'Title only',
      description: undefined,
      assigneeId: undefined,
      startDate: undefined,
      dueDate: undefined,
      number: 99,
      reporterId: userId,
    };
    const result = await repository.update(data);
    expect(result.status).toBe('updated');
    expect(
      await prisma.task.findUniqueOrThrow({ where: { id: taskId } }),
    ).toEqual({
      ...originalTask,
      title: 'Title only',
      updatedAt: expect.any(Date),
    });
  });

  it('nullは説明・担当者・日付を解除する', async () => {
    const result = await update({
      description: null,
      assigneeId: null,
      startDate: null,
      dueDate: null,
    });
    expect(result).toMatchObject({
      status: 'updated',
      task: {
        description: null,
        assignee: null,
        startDate: null,
        dueDate: null,
      },
    });
  });

  it('同じ値なら日付のオブジェクトが別でもupdatedAtを変更しない', async () => {
    const before = await readState();
    const result = await update({
      title: originalTask.title,
      description: originalTask.description,
      status: originalTask.status,
      priority: originalTask.priority,
      assigneeId,
      startDate: new Date(originalTask.startDate!),
      dueDate: new Date(originalTask.dueDate!),
    });
    expect(result.status).toBe('unchanged');
    expect(await readState()).toEqual(before);
  });

  it.each(['owner', 'member', 'viewer'] as const)(
    '担当者には%sも指定できる',
    async (role) => {
      const candidateId = {
        owner: ownerId,
        member: userId,
        viewer: assigneeId,
      }[role];
      await prisma.task.update({
        where: { id: taskId },
        data: { assigneeId: null },
      });
      expect(await update({ assigneeId: candidateId })).toMatchObject({
        status: 'updated',
        task: { assignee: { id: candidateId, name: null } },
      });
    },
  );

  it('viewerは同じ値の指定でも更新できない', async () => {
    await expectRejected(
      { userId: assigneeId, title: originalTask.title },
      'forbidden',
    );
  });

  it('ownerIdが本人でも参加情報がなければ更新できない', async () => {
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: ownerId } },
    });
    await expectRejected(
      { userId: ownerId, title: 'Rejected' },
      'project_not_found',
    );
  });

  it('Project不在と非参加者を同じ結果で拒否する', async () => {
    await expectRejected(
      { projectId: 'missing', title: 'Rejected' },
      'project_not_found',
    );
    await expectRejected(
      { userId: randomUUID(), title: 'Rejected' },
      'project_not_found',
    );
  });

  it('Task不在と別Project所属を同じ結果で拒否する', async () => {
    const otherProject = await prisma.project.create({
      data: {
        ownerId: userId,
        name: 'Other project',
        key: randomUUID(),
        projectMembers: { create: { userId, role: 'owner' } },
      },
    });
    projectIds.push(otherProject.id);
    await expectRejected(
      { taskId: 'missing', title: 'Rejected' },
      'task_not_found',
    );
    await expectRejected(
      { projectId: otherProject.id, title: 'Rejected' },
      'task_not_found',
    );
  });

  it('アーカイブ済みなら同じ値の指定でも更新できない', async () => {
    await prisma.project.update({
      where: { id: projectId },
      data: { isArchived: true },
    });
    await expectRejected({ title: originalTask.title }, 'project_archived');
  });

  it('不在Userと非参加Userを担当者に指定できない', async () => {
    await expectRejected({ assigneeId: randomUUID() }, 'assignee_not_found');
    await prisma.task.update({
      where: { id: taskId },
      data: { assigneeId: null },
    });
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: assigneeId } },
    });
    await expectRejected({ assigneeId }, 'assignee_not_found');
  });

  it.each([
    { startDate: new Date('2026-11-21T00:00:00.000Z') },
    { dueDate: new Date('2026-11-09T00:00:00.000Z') },
  ])('片方の日付だけの変更も保存済みの日付と比較する（%j）', async (dates) => {
    await expectRejected(dates, 'invalid_date_range');
  });

  it('片方の日付を解除したら、もう片方は前後関係を制限しない', async () => {
    expect(
      await update({
        startDate: null,
        dueDate: new Date('2026-11-01T00:00:00.000Z'),
      }),
    ).toMatchObject({ status: 'updated' });
    expect(
      await update({
        startDate: new Date('2026-11-30T00:00:00.000Z'),
        dueDate: null,
      }),
    ).toMatchObject({ status: 'updated' });
  });

  it('保存後に例外が起きた場合はTaskの変更を取り消す', async () => {
    const failure = new Error('更新後の失敗');
    const failingPrisma = prisma.$extends({
      query: {
        task: {
          async update({ args, query }) {
            await query(args);
            throw failure;
          },
        },
      },
    });
    const failingRepository = new TasksRepository(
      failingPrisma as unknown as PrismaService,
    );
    const before = await readState();
    await expect(
      failingRepository.update({
        projectId,
        taskId,
        userId,
        title: 'Rolled back',
      }),
    ).rejects.toThrow(failure);
    expect(await readState()).toEqual(before);
  });

  it.each([
    ['archive', 'project_archived'],
    ['remove_actor', 'project_not_found'],
    ['demote_actor', 'forbidden'],
    ['remove_assignee', 'assignee_not_found'],
    ['change_start_date', 'invalid_date_range'],
  ] as const)(
    'Projectロック待ちの間に%sが保存されても最新状態で検証する',
    async (operation, expectedStatus) => {
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let ready = (_pid: number) => {};
      let rejectReady = (_error: unknown) => {};
      const locked = new Promise<number>((resolve, reject) => {
        ready = resolve;
        rejectReady = reject;
      });
      let committedTask = originalTask;
      const blocker = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`;
          if (operation === 'archive') {
            await tx.project.update({
              where: { id: projectId },
              data: { isArchived: true },
            });
          } else if (operation === 'demote_actor') {
            await tx.projectMember.update({
              where: { projectId_userId: { projectId, userId } },
              data: { role: 'viewer' },
            });
          } else if (operation === 'change_start_date') {
            await tx.task.update({
              where: { id: taskId },
              data: { startDate: new Date('2026-11-16T00:00:00.000Z') },
            });
          } else {
            if (operation === 'remove_assignee') {
              await tx.task.updateMany({
                where: { projectId, assigneeId },
                data: { assigneeId: null },
              });
            }
            await tx.projectMember.delete({
              where: {
                projectId_userId: {
                  projectId,
                  userId: operation === 'remove_actor' ? userId : assigneeId,
                },
              },
            });
          }
          committedTask = await tx.task.findUniqueOrThrow({
            where: { id: taskId },
          });
          const [{ pid }] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          ready(pid);
          await gate;
        },
        { timeout: 10000 },
      );
      blocker.catch(rejectReady);
      let pending: ReturnType<TasksRepository['update']> | undefined;
      try {
        const pid = await locked;
        pending = update({
          title: 'Must not be saved',
          assigneeId,
          dueDate: new Date('2026-11-15T00:00:00.000Z'),
        });
        pending.catch(() => {});
        await vi.waitUntil(
          async () => {
            const [waiting] = await prisma.$queryRaw<{ pid: number }[]>`
            SELECT pid FROM pg_stat_activity
            WHERE ${pid}::integer = ANY(pg_blocking_pids(pid))
              AND query LIKE '%projects%'
          `;
            return waiting?.pid;
          },
          { timeout: 3000, interval: 10 },
        );
        release();
        await blocker;
        expect(await pending).toEqual({ status: expectedStatus });
        expect(
          await prisma.task.findUniqueOrThrow({ where: { id: taskId } }),
        ).toEqual(committedTask);
      } finally {
        release();
        await Promise.allSettled([blocker, ...(pending ? [pending] : [])]);
      }
    },
    15000,
  );
});
