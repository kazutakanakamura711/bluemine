import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type {
  Prisma,
  ProjectMemberRole,
} from '../src/generated/prisma/client.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';

describe('Tasks API', () => {
  let app: INestApplication;
  let appCreated = false;
  let prisma: PrismaService;
  let adminClient: SupabaseClient;
  let projectIds: string[];
  let userIds: string[];
  let userId: string;
  let accessToken: string;

  const projectNotFound = {
    message: 'プロジェクトが見つかりません',
    error: 'Not Found',
    statusCode: 404,
  };

  beforeEach(async () => {
    // 準備途中の失敗でも、今回作成したデータだけを後片付けする。
    appCreated = false;
    projectIds = [];
    userIds = [];
    userId = '';
    accessToken = '';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    appCreated = true;
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    prisma = app.get(PrismaService);
    // テスト中は同じHTTPサーバーを維持し、Supertestによるリクエストごとの起動・終了を避ける。
    await app.listen(0, '127.0.0.1');

    const supabaseUrl = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !secretKey || !publishableKey) {
      throw new Error(
        'テスト用の Supabase URL、Secret key、Publishable key が必要です。',
      );
    }

    // CIとローカルの専用Supabaseを使い、外部サービスへテストユーザーを作らない。
    const url = new URL(supabaseUrl);
    if (
      url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    ) {
      throw new Error('Tasks E2E はローカルの Supabase で実行してください。');
    }

    adminClient = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const loginClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const user = await createAuthUser();
    userId = user.id;
    const { data, error } = await loginClient.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (error) throw error;
    expect(data.user?.id).toBe(userId);
    accessToken = data.session?.access_token ?? '';
    expect(accessToken).toBeTruthy();

    // 本物のtokenを検証し、アプリ側のUserも既存の認証処理から作る。
    const authResponse = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(
      authResponse.status,
      JSON.stringify({
        body: authResponse.body,
        contentType: authResponse.headers['content-type'],
        text: authResponse.body?.message
          ? undefined
          : authResponse.text?.slice(0, 200),
      }),
    ).toBe(200);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (!appCreated) return;

    try {
      // Taskを先に削除し、Projectへの外部キー制約に抵触しないようにする。
      await prisma.$transaction([
        prisma.task.deleteMany({ where: { projectId: { in: projectIds } } }),
        prisma.projectMember.deleteMany({
          where: { projectId: { in: projectIds } },
        }),
        prisma.project.deleteMany({ where: { id: { in: projectIds } } }),
        prisma.user.deleteMany({ where: { id: { in: userIds } } }),
      ]);
    } finally {
      try {
        // DBの後片付けが失敗した場合も、今回のAuthユーザーの削除を試みる。
        const results = await Promise.allSettled(
          userIds.map((id) => adminClient.auth.admin.deleteUser(id)),
        );
        for (const result of results) {
          expect(result, 'テストユーザーの削除に失敗しました。').toMatchObject({
            status: 'fulfilled',
            value: { error: null },
          });
        }
      } finally {
        await app.close();
      }
    }
  });

  // 以下はこのspec専用のfixture。Task作成APIは使わず、Prismaで準備する。
  async function createAuthUser() {
    const email = `tasks-e2e-${randomUUID()}@example.test`;
    const password = `E2e!${randomBytes(24).toString('hex')}`;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (data.user) userIds.push(data.user.id);
    if (error) throw error;
    if (!data.user) throw new Error('テストユーザーを作成できませんでした。');

    return { id: data.user.id, email, password };
  }

  async function createOtherUser() {
    const user = await createAuthUser();
    return prisma.user.create({ data: { id: user.id, email: user.email } });
  }

  async function createProject(ownerId = userId, isArchived = false) {
    const project = await prisma.project.create({
      data: {
        ownerId,
        name: 'Task List Project',
        key: `TLE${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`,
        isArchived,
        projectMembers: { create: { userId: ownerId, role: 'owner' } },
      },
    });
    projectIds.push(project.id);
    return project;
  }

  async function createProjectForRole(
    role: ProjectMemberRole,
    isArchived = false,
  ) {
    const ownerId = role === 'owner' ? userId : (await createOtherUser()).id;
    const project = await createProject(ownerId, isArchived);
    if (role !== 'owner') {
      await prisma.projectMember.create({
        data: { projectId: project.id, userId, role },
      });
    }
    return project;
  }

  async function createTask(
    projectId: string,
    data: Omit<
      Prisma.TaskUncheckedCreateInput,
      'projectId' | 'number' | 'reporterId'
    > & { reporterId?: string } = { title: 'Fixture Task' },
  ) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: projectId },
        data: { lastTaskNumber: { increment: 1 } },
        select: { lastTaskNumber: true, ownerId: true },
      });

      // テストデータの報告者は、指定がなければProjectのownerを使う。
      return tx.task.create({
        data: {
          ...data,
          projectId,
          number: project.lastTaskNumber,
          reporterId: data.reporterId ?? project.ownerId,
        },
      });
    });
  }

  // 認証時のUser同期とは別に、取得対象の値・更新日時の不変性を確認する。
  function readProjectState() {
    return prisma.project.findMany({
      where: { id: { in: projectIds } },
      orderBy: { id: 'asc' },
      include: {
        projectMembers: { orderBy: { id: 'asc' } },
        tasks: { orderBy: { id: 'asc' } },
      },
    });
  }

  describe('DELETE /api/projects/:projectId/tasks/:taskId', () => {
    function deleteTask(projectId: string, taskId: string) {
      return request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`);
    }

    const taskNotFound = {
      message: 'タスクが見つかりません',
      error: 'Not Found',
      statusCode: 404,
    };

    // 固定時間ではなく、指定した接続によるロック待ちをDBで確認する。
    async function waitForBlockedQuery(
      blockerPid: number,
      prefix: string,
      table: string,
    ) {
      return vi.waitUntil(
        async () => {
          const [waiting] = await prisma.$queryRaw<{ pid: number }[]>`
            SELECT pid FROM pg_stat_activity
            WHERE ${blockerPid}::integer = ANY(pg_blocking_pids(pid))
              AND query LIKE ${prefix + '%'} AND query LIKE ${'%' + table + '%'}
          `;
          return waiting?.pid;
        },
        { timeout: 3000, interval: 10 },
      );
    }

    it.each(['todo', 'done'] as const)(
      'ownerは%sのTaskを削除し、204と空の本文を返す',
      async (status) => {
        const project = await createProject();
        const assignee = await createOtherUser();
        await prisma.projectMember.create({
          data: { projectId: project.id, userId: assignee.id, role: 'member' },
        });
        const task = await createTask(project.id, {
          title: '削除するTask',
          status,
          assigneeId: assignee.id,
        });
        await createTask(project.id, { title: '残すTask' });
        const otherProject = await createProject();
        await createTask(otherProject.id);
        const before = await readProjectState();
        const assigneeBefore = await prisma.user.findUniqueOrThrow({
          where: { id: assignee.id },
        });

        const response = await deleteTask(project.id, task.id).expect(204);

        expect(response.text).toBe('');
        expect(await readProjectState()).toEqual(
          before.map((item) => ({
            ...item,
            tasks: item.tasks.filter((existing) => existing.id !== task.id),
          })),
        );
        expect(
          await prisma.user.findUniqueOrThrow({ where: { id: assignee.id } }),
        ).toEqual(assigneeBefore);
        await request(app.getHttpServer())
          .get(`/api/projects/${project.id}/tasks/${task.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404)
          .expect(taskNotFound);
      },
    );

    it.each([undefined, 'Basic invalid', 'Bearer invalid-token'])(
      '認証ヘッダー%sは401で拒否し、データを変更しない',
      async (authorization) => {
        const project = await createProject();
        const task = await createTask(project.id);
        const before = await readProjectState();
        const pending = request(app.getHttpServer()).delete(
          `/api/projects/${project.id}/tasks/${task.id}`,
        );
        if (authorization) pending.set('Authorization', authorization);
        await pending.expect(401);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([{ email: undefined }, { email_confirmed_at: undefined }])(
      'メール条件を満たさなければ403で拒否する: %j',
      async (emailState) => {
        const project = await createProject();
        const task = await createTask(project.id);
        const before = await readProjectState();
        const authService = app.get(AuthService);
        const verifiedUser = await authService.verifyAccessToken(accessToken);
        vi.spyOn(authService, 'verifyAccessToken').mockResolvedValueOnce({
          ...verifiedUser,
          ...emailState,
        });
        await deleteTask(project.id, task.id).expect(403);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([
      ['member', false],
      ['member', true],
      ['viewer', false],
      ['viewer', true],
    ] as const)(
      '%sはアーカイブ状態%sやTaskの有無によらず403で拒否する',
      async (role, isArchived) => {
        const project = await createProjectForRole(role, isArchived);
        const task = await createTask(project.id);
        const before = await readProjectState();
        for (const taskId of [task.id, 'not-found']) {
          await deleteTask(project.id, taskId)
            .query({ userId: project.ownerId })
            .expect(403)
            .expect({
              message: 'タスクを削除する権限がありません',
              error: 'Forbidden',
              statusCode: 403,
            });
        }
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([false, true])(
      '非参加者はアーカイブ状態%sやTaskの有無によらずProjectの404を返す',
      async (isArchived) => {
        const owner = await createOtherUser();
        const project = await createProject(owner.id, isArchived);
        const task = await createTask(project.id);
        const before = await readProjectState();
        for (const [projectId, taskId] of [
          [project.id, task.id],
          [project.id, 'not-found'],
          ['not-found', task.id],
        ]) {
          await deleteTask(projectId, taskId)
            .expect(404)
            .expect(projectNotFound);
        }
        expect(await readProjectState()).toEqual(before);
      },
    );

    it('ownerIdが本人でも参加情報がなければ404で拒否する', async () => {
      const project = await createProject();
      const task = await createTask(project.id);
      await prisma.projectMember.delete({
        where: { projectId_userId: { projectId: project.id, userId } },
      });
      const before = await readProjectState();
      await deleteTask(project.id, task.id).expect(404).expect(projectNotFound);
      expect(await readProjectState()).toEqual(before);
    });

    it('アーカイブ済みならTaskの有無や所属より先に409で拒否する', async () => {
      const project = await createProject(userId, true);
      const task = await createTask(project.id);
      const otherProject = await createProject();
      const otherTask = await createTask(otherProject.id);
      const before = await readProjectState();
      for (const taskId of [task.id, otherTask.id, 'not-found']) {
        await deleteTask(project.id, taskId).expect(409).expect({
          message: 'アーカイブ済みのプロジェクトはタスクを削除できません',
          error: 'Conflict',
          statusCode: 409,
        });
      }
      expect(await readProjectState()).toEqual(before);
    });

    it('両Projectのownerでも別ProjectのTaskと不在のTaskは同じ404になる', async () => {
      const project = await createProject();
      const otherProject = await createProject();
      const otherTask = await createTask(otherProject.id);
      const before = await readProjectState();
      for (const taskId of [otherTask.id, 'not-found']) {
        await deleteTask(project.id, taskId).expect(404).expect(taskNotFound);
      }
      expect(await readProjectState()).toEqual(before);
    });

    it('削除済みのTaskを再び削除すると404になる', async () => {
      const project = await createProject();
      const task = await createTask(project.id);
      await deleteTask(project.id, task.id).expect(204);
      const before = await readProjectState();
      await deleteTask(project.id, task.id).expect(404).expect(taskNotFound);
      expect(await readProjectState()).toEqual(before);
    });

    it('同じTaskの同時削除は1件だけ成功し、後続は404になる', async () => {
      const project = await createProject();
      const task = await createTask(project.id);
      const before = await readProjectState();
      const responses = await Promise.all([
        deleteTask(project.id, task.id),
        deleteTask(project.id, task.id),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        204, 404,
      ]);
      expect(responses.find((response) => response.status === 204)?.text).toBe(
        '',
      );
      expect(
        responses.find((response) => response.status === 404)?.body,
      ).toEqual(taskNotFound);
      expect(await readProjectState()).toEqual(
        before.map((item) => ({
          ...item,
          tasks: item.tasks.filter((existing) => existing.id !== task.id),
        })),
      );
    });

    it.each([
      ['archive', 409],
      ['remove_actor', 404],
      ['demote_actor', 403],
    ] as const)(
      'Projectロック待ちの間に%sが保存されると最新状態で削除を拒否する',
      async (operation, expectedStatus) => {
        const project = await createProject();
        const task = await createTask(project.id);
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

        // ownerの脱退・降格は通常のAPIでは禁止されるため、保存時の再確認を直接再現する。
        const blocker = prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM projects WHERE id = ${project.id} FOR UPDATE`;
            if (operation === 'archive') {
              await tx.project.update({
                where: { id: project.id },
                data: { isArchived: true },
              });
            } else if (operation === 'remove_actor') {
              await tx.projectMember.delete({
                where: { projectId_userId: { projectId: project.id, userId } },
              });
            } else {
              await tx.projectMember.update({
                where: { projectId_userId: { projectId: project.id, userId } },
                data: { role: 'member' },
              });
            }
            const [{ pid }] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            ready(pid);
            await gate;
          },
          { timeout: 10000 },
        );
        blocker.catch(rejectReady);
        let pending: Promise<request.Response> | undefined;
        try {
          const blockerPid = await locked;
          pending = deleteTask(project.id, task.id).then(
            (response) => response,
          );
          pending.catch(() => {});
          await waitForBlockedQuery(blockerPid, '%SELECT', 'projects');
          release();
          await blocker;
          const afterChange = await readProjectState();
          const response = await pending;
          expect(response.status).toBe(expectedStatus);
          expect(await readProjectState()).toEqual(afterChange);
          expect(
            await prisma.task.findUnique({ where: { id: task.id } }),
          ).toEqual(task);
        } finally {
          release();
          await Promise.allSettled([blocker, ...(pending ? [pending] : [])]);
        }
      },
      15000,
    );

    it.each([
      ['update', 'delete'],
      ['delete', 'update'],
      ['delete', 'archive'],
      ['delete', 'delete'],
    ] as const)(
      '%sがProjectを先にロックした場合は後続の%sが完了まで待つ',
      async (first, second) => {
        const project = await createProject();
        const task = await createTask(project.id, { title: '変更前' });
        const otherTask = await createTask(project.id, { title: '変更しない' });
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
        const blocker = prisma.$transaction(
          async (tx) => {
            // Taskへの書き込みを待たせ、その間に最初のAPIがProject行を保持する。
            await tx.$executeRaw`LOCK TABLE tasks IN SHARE MODE`;
            const [{ pid }] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            ready(pid);
            await gate;
          },
          { timeout: 10000 },
        );
        blocker.catch(rejectReady);
        let pendingFirst: Promise<request.Response> | undefined;
        let pendingSecond: Promise<request.Response> | undefined;
        try {
          const blockerPid = await locked;
          pendingFirst = (
            first === 'update'
              ? request(app.getHttpServer())
                  .patch(`/api/projects/${project.id}/tasks/${task.id}`)
                  .set('Authorization', `Bearer ${accessToken}`)
                  .send({ title: '変更後' })
              : deleteTask(project.id, task.id)
          ).then((response) => response);
          pendingFirst.catch(() => {});
          const firstPid = await waitForBlockedQuery(
            blockerPid,
            first === 'update' ? 'UPDATE' : 'DELETE',
            'tasks',
          );

          pendingSecond = (
            second === 'update'
              ? request(app.getHttpServer())
                  .patch(`/api/projects/${project.id}/tasks/${task.id}`)
                  .set('Authorization', `Bearer ${accessToken}`)
                  .send({ title: '変更後' })
              : second === 'archive'
                ? request(app.getHttpServer())
                    .post(`/api/projects/${project.id}/archive`)
                    .set('Authorization', `Bearer ${accessToken}`)
                : deleteTask(project.id, task.id)
          ).then((response) => response);
          pendingSecond.catch(() => {});
          await waitForBlockedQuery(
            firstPid,
            second === 'archive' ? 'UPDATE' : '%SELECT',
            'projects',
          );

          release();
          await blocker;
          const [firstResponse, secondResponse] = await Promise.all([
            pendingFirst,
            pendingSecond,
          ]);
          expect(firstResponse.status).toBe(first === 'update' ? 200 : 204);
          expect(secondResponse.status).toBe(
            second === 'archive' ? 200 : first === 'update' ? 204 : 404,
          );
          if (first === 'update') {
            expect(firstResponse.body.title).toBe('変更後');
          }
          if (secondResponse.status === 404) {
            expect(secondResponse.body).toEqual(taskNotFound);
          }
          expect(
            await prisma.task.findUnique({ where: { id: task.id } }),
          ).toBeNull();
          expect(
            await prisma.task.findUniqueOrThrow({
              where: { id: otherTask.id },
            }),
          ).toEqual(otherTask);
          expect(
            await prisma.project.findUniqueOrThrow({
              where: { id: project.id },
            }),
          ).toMatchObject({
            isArchived: second === 'archive',
            lastTaskNumber: 2,
          });
        } finally {
          release();
          await Promise.allSettled([
            blocker,
            ...(pendingFirst ? [pendingFirst] : []),
            ...(pendingSecond ? [pendingSecond] : []),
          ]);
        }
      },
      15000,
    );

    it('削除後に例外が起きた場合はtransactionを取り消す', async () => {
      const project = await createProject();
      const task = await createTask(project.id);
      const before = await readProjectState();
      const runTransaction = prisma.$transaction.bind(prisma);
      let deletionSeen = false;
      app.useLogger(false);
      const spy = vi
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce((operation, options) =>
          runTransaction(async (tx) => {
            await operation(tx);
            deletionSeen =
              (await tx.task.findUnique({ where: { id: task.id } })) === null;
            throw new Error('削除後の失敗時のrollbackを確認する');
          }, options),
        );
      try {
        await deleteTask(project.id, task.id).expect(500);
        expect(deletionSeen).toBe(true);
        expect(await readProjectState()).toEqual(before);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('PATCH /api/projects/:projectId/tasks/:taskId', () => {
    function patchTask(
      projectId: string,
      taskId: string,
      body: Record<string, unknown>,
    ) {
      return request(app.getHttpServer())
        .patch(`/api/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body);
    }

    it.each(['owner', 'member'] as const)(
      '%sは7項目を更新でき、既存の13項目の形式で返す',
      async (role) => {
        const project = await createProjectForRole(role);
        const task = await createTask(project.id, {
          title: 'Original',
          updatedAt: new Date('2026-10-31T00:00:00.000Z'),
        });
        await createTask(project.id);
        const assignee = await createOtherUser();
        await prisma.projectMember.create({
          data: { projectId: project.id, userId: assignee.id, role: 'viewer' },
        });
        const before = await readProjectState();
        const { body } = await patchTask(project.id, task.id, {
          title: '  Updated  ',
          description: '  Description\n2行目  ',
          status: 'done',
          priority: 'high',
          assigneeId: assignee.id,
          startDate: '2026-11-10',
          dueDate: '2026-11-10',
        }).expect(200);
        const saved = await prisma.task.findUniqueOrThrow({
          where: { id: task.id },
        });
        expect(body).toEqual({
          id: task.id,
          projectId: project.id,
          number: task.number,
          title: 'Updated',
          description: 'Description\n2行目',
          status: 'done',
          priority: 'high',
          assignee: { id: assignee.id, name: null },
          reporter: { id: task.reporterId, name: null },
          startDate: '2026-11-10',
          dueDate: '2026-11-10',
          createdAt: task.createdAt.toISOString(),
          updatedAt: saved.updatedAt.toISOString(),
        });
        expect(saved).toEqual({
          ...task,
          title: 'Updated',
          description: 'Description\n2行目',
          status: 'done',
          priority: 'high',
          assigneeId: assignee.id,
          startDate: new Date('2026-11-10T00:00:00.000Z'),
          dueDate: new Date('2026-11-10T00:00:00.000Z'),
          updatedAt: saved.updatedAt,
        });
        expect(saved.updatedAt.getTime()).toBeGreaterThan(
          task.updatedAt.getTime(),
        );
        expect(await readProjectState()).toEqual(
          before.map((item) => ({
            ...item,
            tasks: item.tasks.map((existing) =>
              existing.id === task.id ? saved : existing,
            ),
          })),
        );
        await request(app.getHttpServer())
          .get(`/api/projects/${project.id}/tasks/${task.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
          .expect(body);
      },
    );

    it('statusだけの更新では、担当者・日付などの省略項目を維持する', async () => {
      const project = await createProject();
      const task = await createTask(project.id, {
        title: 'Keep title',
        description: 'Keep description',
        priority: 'high',
        assigneeId: userId,
        startDate: new Date('2026-11-10T00:00:00.000Z'),
        dueDate: new Date('2026-11-20T00:00:00.000Z'),
      });
      await patchTask(project.id, task.id, { status: 'done' }).expect(200);
      expect(
        await prisma.task.findUniqueOrThrow({ where: { id: task.id } }),
      ).toEqual({
        ...task,
        status: 'done',
        updatedAt: expect.any(Date),
      });
    });

    it.each([null, ' \n\t '])(
      '説明の%jと担当者・日付のnullは解除として保存する',
      async (description) => {
        const project = await createProject();
        const task = await createTask(project.id, {
          title: 'Clear optional fields',
          description: 'Description',
          assigneeId: userId,
          startDate: new Date('2026-11-10T00:00:00.000Z'),
          dueDate: new Date('2026-11-20T00:00:00.000Z'),
        });
        const { body } = await patchTask(project.id, task.id, {
          description,
          assigneeId: null,
          startDate: null,
          dueDate: null,
        }).expect(200);
        expect(body).toMatchObject({
          description: null,
          assignee: null,
          startDate: null,
          dueDate: null,
        });
        expect(
          await prisma.task.findUniqueOrThrow({ where: { id: task.id } }),
        ).toEqual({
          ...task,
          description: null,
          assigneeId: null,
          startDate: null,
          dueDate: null,
          updatedAt: expect.any(Date),
        });
      },
    );

    it('正規化後にすべて同じ値なら200を返し、更新日時を維持する', async () => {
      const project = await createProject();
      const task = await createTask(project.id, {
        title: 'Unchanged',
        description: 'Description',
        assigneeId: userId,
        startDate: new Date('2026-11-10T00:00:00.000Z'),
        dueDate: new Date('2026-11-20T00:00:00.000Z'),
        updatedAt: new Date('2026-10-31T00:00:00.000Z'),
      });
      const before = await readProjectState();
      const { body } = await patchTask(project.id, task.id, {
        title: '  Unchanged  ',
        description: '  Description  ',
        status: task.status,
        priority: task.priority,
        assigneeId: userId,
        startDate: '2026-11-10',
        dueDate: '2026-11-20',
      }).expect(200);
      expect(body.updatedAt).toBe(task.updatedAt.toISOString());
      expect(await readProjectState()).toEqual(before);
    });

    it.each([
      { title: 'a'.repeat(200), description: 'a'.repeat(5000) },
      { startDate: '0001-01-01', dueDate: '9999-12-31' },
      { startDate: '2028-02-29', dueDate: '2028-02-29' },
    ])('文字数・日付の境界値を受け付ける: %j', async (input) => {
      const project = await createProject();
      const task = await createTask(project.id);
      const { body } = await patchTask(project.id, task.id, input).expect(200);
      expect(body).toMatchObject(input);
    });

    it.each([
      ['空本文', {}],
      ['title null', { title: null }],
      ['title数値', { title: 1 }],
      ['空title', { title: '' }],
      ['空白title', { title: ' \n\t ' }],
      ['title 201文字', { title: 'a'.repeat(201) }],
      ['description数値', { description: 1 }],
      ['description 5001文字', { description: 'a'.repeat(5001) }],
      ['status不正', { status: 'closed' }],
      ['status null', { status: null }],
      ['priority不正', { priority: 'urgent' }],
      ['priority null', { priority: null }],
      ['assigneeId形式不正', { assigneeId: 'not-a-uuid' }],
      ['assigneeId空文字', { assigneeId: '' }],
      ['assigneeId数値', { assigneeId: 1 }],
      ['開始日不正', { startDate: '2026-02-29' }],
      ['期限不正', { dueDate: '2026-04-31' }],
      ['開始日空文字', { startDate: '' }],
      ['期限空文字', { dueDate: '' }],
      ['開始日に時刻', { startDate: '2026-11-10T00:00:00Z' }],
      ['期限に時刻', { dueDate: '2026-11-10T00:00:00+09:00' }],
      ['日付の0埋めなし', { startDate: '2026-1-1' }],
      ['0年', { dueDate: '0000-01-01' }],
      ['日付数値', { startDate: 20261110 }],
      [
        '期限が開始日より前',
        { startDate: '2026-11-10', dueDate: '2026-11-09' },
      ],
      ['number指定', { number: 99 }],
      [
        'reporterId指定',
        { reporterId: '11111111-1111-4111-8111-111111111111' },
      ],
      ['projectId指定', { projectId: 'another' }],
      ['userId指定', { userId: 'another' }],
      ['id指定', { id: 'another' }],
      ['createdAt指定', { createdAt: '2026-11-10T00:00:00Z' }],
      ['updatedAt指定', { updatedAt: '2026-11-10T00:00:00Z' }],
      ['定義外の項目', { extra: true }],
    ])(
      '%sは400で拒否し、Task・Project・参加情報を変更しない',
      async (_label, input) => {
        const project = await createProject();
        const task = await createTask(project.id);
        const before = await readProjectState();
        await patchTask(project.id, task.id, input).expect(400);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([undefined, 'null', '[]'])(
      'JSONオブジェクトでない本文%sは400で拒否する',
      async (body) => {
        const project = await createProject();
        const task = await createTask(project.id);
        const before = await readProjectState();
        const pending = request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/tasks/${task.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .set('Content-Type', 'application/json');
        if (body !== undefined) pending.send(body);
        await pending.expect(400);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([undefined, 'Basic invalid', 'Bearer invalid-token'])(
      '認証ヘッダー%sは401で拒否する',
      async (authorization) => {
        const project = await createProject();
        const task = await createTask(project.id);
        const before = await readProjectState();
        const pending = request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/tasks/${task.id}`)
          .send({ status: 'done' });
        if (authorization) pending.set('Authorization', authorization);
        await pending.expect(401);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([{ email: undefined }, { email_confirmed_at: undefined }])(
      'メール条件を満たさなければ403で拒否する: %j',
      async (emailState) => {
        const project = await createProject();
        const task = await createTask(project.id);
        const before = await readProjectState();
        const authService = app.get(AuthService);
        const verifiedUser = await authService.verifyAccessToken(accessToken);
        vi.spyOn(authService, 'verifyAccessToken').mockResolvedValueOnce({
          ...verifiedUser,
          ...emailState,
        });
        await patchTask(project.id, task.id, { status: 'done' }).expect(403);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([false, true])(
      '非参加者は404、viewerは403を返す（archive=%s）',
      async (isArchived) => {
        const other = await createOtherUser();
        const project = await createProject(other.id, isArchived);
        const task = await createTask(project.id);
        const viewerProject = await createProjectForRole('viewer', isArchived);
        const viewerTask = await createTask(viewerProject.id);
        const before = await readProjectState();
        for (const projectId of [project.id, 'not-found']) {
          await patchTask(projectId, task.id, { status: 'done' })
            .expect(404)
            .expect(projectNotFound);
        }
        await patchTask(viewerProject.id, viewerTask.id, { status: 'done' })
          .query({ userId: viewerProject.ownerId })
          .expect(403);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it('ownerIdが本人でも、参加情報の削除後は同じtokenで404になる', async () => {
      const project = await createProject();
      const task = await createTask(project.id);
      await patchTask(project.id, task.id, { status: 'in_progress' }).expect(
        200,
      );
      await prisma.projectMember.delete({
        where: { projectId_userId: { projectId: project.id, userId } },
      });
      const before = await readProjectState();
      await patchTask(project.id, task.id, { status: 'done' })
        .expect(404)
        .expect(projectNotFound);
      expect(await readProjectState()).toEqual(before);
    });

    it('両Projectのownerでも、別ProjectのTaskと存在しないTaskは同じ404になる', async () => {
      const project = await createProject();
      const other = await createProject();
      const otherTask = await createTask(other.id);
      const before = await readProjectState();
      for (const taskId of [otherTask.id, 'not-found']) {
        await patchTask(project.id, taskId, { status: 'done' })
          .expect(404)
          .expect({
            message: 'タスクが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });
      }
      expect(await readProjectState()).toEqual(before);
    });

    it.each(['owner', 'member'] as const)(
      'アーカイブ済みでは%sも同じ値の更新を409で拒否する',
      async (role) => {
        const project = await createProjectForRole(role, true);
        const task = await createTask(project.id);
        const before = await readProjectState();
        await patchTask(project.id, task.id, { title: task.title }).expect(409);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each(['owner', 'member', 'viewer'] as const)(
      '同じProjectの%sを担当者に設定できる',
      async (role) => {
        const project = await createProject();
        const task = await createTask(project.id);
        const assignee =
          role === 'owner'
            ? await prisma.user.findUniqueOrThrow({ where: { id: userId } })
            : await createOtherUser();
        if (role !== 'owner') {
          await prisma.projectMember.create({
            data: { projectId: project.id, userId: assignee.id, role },
          });
        }
        const { body } = await patchTask(project.id, task.id, {
          assigneeId: assignee.id,
        }).expect(200);
        expect(body.assignee).toEqual({ id: assignee.id, name: null });
      },
    );

    it('不在・非参加・別Projectだけの参加者は担当者に指定できない', async () => {
      const project = await createProject();
      const task = await createTask(project.id);
      const outsider = await createOtherUser();
      await createProject(outsider.id);
      const before = await readProjectState();
      for (const assigneeId of [randomUUID(), outsider.id]) {
        await patchTask(project.id, task.id, { assigneeId })
          .expect(400)
          .expect({
            message: '担当者は同じプロジェクトの参加者を指定してください',
            error: 'Bad Request',
            statusCode: 400,
          });
      }
      expect(await readProjectState()).toEqual(before);
    });

    it.each([{ startDate: '2026-11-21' }, { dueDate: '2026-11-09' }])(
      '片方だけの日付変更も保存済みの日付と合わせて400で拒否する: %j',
      async (input) => {
        const project = await createProject();
        const task = await createTask(project.id, {
          title: 'Dates',
          startDate: new Date('2026-11-10T00:00:00.000Z'),
          dueDate: new Date('2026-11-20T00:00:00.000Z'),
        });
        const before = await readProjectState();
        await patchTask(project.id, task.id, input).expect(400).expect({
          message: '期限は開始日以降の日付を指定してください',
          error: 'Bad Request',
          statusCode: 400,
        });
        expect(await readProjectState()).toEqual(before);
      },
    );

    it('報告者が脱退済みでもTaskを更新でき、報告者への参照を維持する', async () => {
      const project = await createProject();
      const reporter = await createOtherUser();
      const membership = await prisma.projectMember.create({
        data: { projectId: project.id, userId: reporter.id, role: 'member' },
      });
      const task = await createTask(project.id, {
        title: 'Former reporter',
        reporterId: reporter.id,
      });
      await prisma.projectMember.delete({ where: { id: membership.id } });
      const { body } = await patchTask(project.id, task.id, {
        status: 'done',
      }).expect(200);
      expect(body.reporter).toEqual({ id: reporter.id, name: null });
      expect(
        (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
          .reporterId,
      ).toBe(reporter.id);
    });
  });

  describe('POST /api/projects/:projectId/tasks', () => {
    function postTask(
      projectId: string,
      body: Record<string, unknown> = { title: 'New Task' },
    ) {
      return request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body);
    }

    it.each(['owner', 'member'] as const)(
      '%sは最小入力で作成でき、本人を報告者にして13項目だけ返す',
      async (role) => {
        const project = await createProjectForRole(role);
        const before = await readProjectState();
        const { body } = await postTask(project.id, {
          title: '  New Task  ',
        }).expect(201);
        const saved = await prisma.task.findUniqueOrThrow({
          where: { id: body.id },
        });

        expect(body).toEqual({
          id: saved.id,
          projectId: project.id,
          number: 1,
          title: 'New Task',
          description: null,
          status: 'todo',
          priority: 'normal',
          assignee: null,
          reporter: { id: userId, name: null },
          startDate: null,
          dueDate: null,
          createdAt: saved.createdAt.toISOString(),
          updatedAt: saved.updatedAt.toISOString(),
        });
        expect(saved).toMatchObject({
          number: 1,
          reporterId: userId,
          assigneeId: null,
        });
        const [after] = await readProjectState();
        expect(after).toEqual({
          ...before[0],
          lastTaskNumber: 1,
          updatedAt: after.updatedAt,
          tasks: [saved],
        });
        await request(app.getHttpServer())
          .get(`/api/projects/${project.id}/tasks/${saved.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
          .expect(body);
        await request(app.getHttpServer())
          .get(`/api/projects/${project.id}/tasks`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
          .expect([body]);
      },
    );

    it.each(['owner', 'member', 'viewer'] as const)(
      '同じProjectの%sを担当者にできる',
      async (role) => {
        const project = await createProject();
        const assignee =
          role === 'owner'
            ? await prisma.user.findUniqueOrThrow({ where: { id: userId } })
            : await createOtherUser();
        if (role !== 'owner') {
          await prisma.projectMember.create({
            data: { projectId: project.id, userId: assignee.id, role },
          });
        }
        await adminClient.auth.admin.updateUserById(userId, {
          user_metadata: { name: '報告者' },
        });
        if (role !== 'owner') {
          await prisma.user.update({
            where: { id: assignee.id },
            data: { name: '担当者' },
          });
        }
        const { body } = await postTask(project.id, {
          title: 'Details',
          description: '  説明\n2行目  ',
          status: 'in_progress',
          priority: 'high',
          assigneeId: assignee.id,
          startDate: '2028-02-29',
          dueDate: '2028-03-01',
        }).expect(201);
        expect(body).toMatchObject({
          description: '説明\n2行目',
          status: 'in_progress',
          priority: 'high',
          assignee: {
            id: assignee.id,
            name: role === 'owner' ? '報告者' : '担当者',
          },
          reporter: { id: userId, name: '報告者' },
          startDate: '2028-02-29',
          dueDate: '2028-03-01',
        });
        expect(Object.keys(body.assignee).sort()).toEqual(['id', 'name']);
        expect(Object.keys(body.reporter).sort()).toEqual(['id', 'name']);
        const saved = await prisma.task.findUniqueOrThrow({
          where: { id: body.id },
        });
        expect(saved.startDate?.toISOString()).toBe('2028-02-29T00:00:00.000Z');
        expect(saved.dueDate?.toISOString()).toBe('2028-03-01T00:00:00.000Z');
      },
    );

    it.each([
      { description: null, assigneeId: null, startDate: null, dueDate: null },
      { description: ' \n\t ', status: 'done', priority: 'low' },
      {
        title: 'a'.repeat(200),
        description: 'a'.repeat(5000),
        startDate: '2026-10-30',
        dueDate: '2026-10-30',
      },
      { startDate: '2026-10-30' },
      { dueDate: '2026-10-30' },
      { startDate: '0001-01-01', dueDate: '9999-12-31' },
    ])('任意項目の省略・null・境界値を保存する: %j', async (input) => {
      const project = await createProject();
      const { body } = await postTask(project.id, {
        title: 'Optional',
        ...input,
      }).expect(201);
      expect(body).toMatchObject({
        title: input.title ?? 'Optional',
        description: input.description?.trim() || null,
        status: input.status ?? 'todo',
        priority: input.priority ?? 'normal',
        assignee: null,
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
      });
    });

    it.each([
      ['titleなし', {}],
      ['title null', { title: null }],
      ['title数値', { title: 1 }],
      ['空title', { title: '' }],
      ['空白title', { title: ' \n\t ' }],
      ['title 201文字', { title: 'a'.repeat(201) }],
      ['description数値', { title: 'Task', description: 1 }],
      [
        'description 5001文字',
        { title: 'Task', description: 'a'.repeat(5001) },
      ],
      ['status不正', { title: 'Task', status: 'closed' }],
      ['status null', { title: 'Task', status: null }],
      ['priority不正', { title: 'Task', priority: 'urgent' }],
      ['priority null', { title: 'Task', priority: null }],
      ['assigneeId形式不正', { title: 'Task', assigneeId: 'not-a-uuid' }],
      ['assigneeId数値', { title: 'Task', assigneeId: 1 }],
      ['開始日不正', { title: 'Task', startDate: '2026-02-29' }],
      ['期限不正', { title: 'Task', dueDate: '2026-04-31' }],
      ['開始日に時刻', { title: 'Task', startDate: '2026-10-30T00:00:00Z' }],
      ['期限に時刻', { title: 'Task', dueDate: '2026-10-30T00:00:00+09:00' }],
      ['日付の0埋めなし', { title: 'Task', startDate: '2026-1-1' }],
      ['0年', { title: 'Task', dueDate: '0000-01-01' }],
      ['日付数値', { title: 'Task', startDate: 20261030 }],
      [
        '期限が開始日より前',
        { title: 'Task', startDate: '2026-10-30', dueDate: '2026-10-29' },
      ],
      ['number指定', { title: 'Task', number: 99 }],
      [
        'reporterId指定',
        { title: 'Task', reporterId: '11111111-1111-4111-8111-111111111111' },
      ],
      ['projectId指定', { title: 'Task', projectId: 'another' }],
      ['userId指定', { title: 'Task', userId: 'another' }],
      ['id指定', { title: 'Task', id: 'another' }],
      ['定義外の項目', { title: 'Task', extra: true }],
    ])(
      '%sは400で拒否し、カウンター・Task・参加情報を変更しない',
      async (_label, input) => {
        const project = await createProject();
        const before = await readProjectState();
        await postTask(project.id, input).expect(400);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([undefined, 'Basic invalid', 'Bearer invalid-token'])(
      '認証ヘッダー%sは401で拒否する',
      async (authorization) => {
        const project = await createProject();
        const before = await readProjectState();
        const pending = request(app.getHttpServer())
          .post(`/api/projects/${project.id}/tasks`)
          .send({ title: 'Task' });
        if (authorization) pending.set('Authorization', authorization);
        await pending.expect(401);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([{ email: undefined }, { email_confirmed_at: undefined }])(
      'メール条件を満たさなければ403で拒否する: %j',
      async (emailState) => {
        const project = await createProject();
        const before = await readProjectState();
        const authService = app.get(AuthService);
        const verifiedUser = await authService.verifyAccessToken(accessToken);
        vi.spyOn(authService, 'verifyAccessToken').mockResolvedValueOnce({
          ...verifiedUser,
          ...emailState,
        });
        await postTask(project.id).expect(403);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([false, true])(
      '非参加者はProject不在と同じ404、viewerは403になる（archive=%s）',
      async (isArchived) => {
        const other = await createOtherUser();
        const project = await createProject(other.id, isArchived);
        const viewerProject = await createProjectForRole('viewer', isArchived);
        const before = await readProjectState();
        for (const projectId of [project.id, 'not-found']) {
          await postTask(projectId, { title: 'Task', assigneeId: randomUUID() })
            .expect(404)
            .expect(projectNotFound);
        }
        await postTask(viewerProject.id).expect(403);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it('ownerIdが本人でも参加情報を失えば作成できない', async () => {
      const project = await createProject();
      await prisma.projectMember.deleteMany({
        where: { projectId: project.id, userId },
      });
      const before = await readProjectState();
      await postTask(project.id).expect(404).expect(projectNotFound);
      expect(await readProjectState()).toEqual(before);
    });

    it('queryのuserId・reporterId・numberで実行者・報告者・採番を指定できない', async () => {
      const other = await createOtherUser();
      const otherProject = await createProject(other.id);
      const before = await readProjectState();
      await postTask(otherProject.id)
        .query({ userId: other.id })
        .expect(404)
        .expect(projectNotFound);
      expect(await readProjectState()).toEqual(before);

      const project = await createProject();
      const { body } = await postTask(project.id)
        .query({ userId: other.id, reporterId: other.id, number: 99 })
        .expect(201);
      expect(body).toMatchObject({
        number: 1,
        reporter: { id: userId, name: null },
      });
    });

    it.each(['owner', 'member'] as const)(
      'アーカイブ済みProjectには%sも作成できない',
      async (role) => {
        const project = await createProjectForRole(role, true);
        const before = await readProjectState();
        await postTask(project.id, {
          title: 'Task',
          assigneeId: randomUUID(),
        }).expect(409);
        expect(await readProjectState()).toEqual(before);
      },
    );

    it('存在しないUser・非参加User・別Projectだけの参加Userは同じ400で拒否する', async () => {
      const project = await createProject();
      const outsider = await createOtherUser();
      const otherMember = await createOtherUser();
      await createProject(otherMember.id);
      const before = await readProjectState();
      for (const assigneeId of [randomUUID(), outsider.id, otherMember.id]) {
        await postTask(project.id, { title: 'Task', assigneeId })
          .expect(400)
          .expect({
            message: '担当者は同じプロジェクトの参加者を指定してください',
            error: 'Bad Request',
            statusCode: 400,
          });
        expect(await readProjectState()).toEqual(before);
      }
    });

    it('Projectごとに1から採番し、削除後も番号を再利用しない', async () => {
      const project = await createProject();
      const otherProject = await createProject();
      const first = await postTask(project.id).expect(201);
      const second = await postTask(project.id).expect(201);
      await request(app.getHttpServer())
        .delete(`/api/projects/${project.id}/tasks/${second.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      const third = await postTask(project.id).expect(201);
      const other = await postTask(otherProject.id).expect(201);
      expect([
        first.body.number,
        second.body.number,
        third.body.number,
        other.body.number,
      ]).toEqual([1, 2, 3, 1]);
      expect(
        await prisma.project.findUnique({ where: { id: project.id } }),
      ).toMatchObject({ lastTaskNumber: 3 });
    });

    it('同時作成でも番号が重複せず、すべてのTaskを保存する', async () => {
      const project = await createProject();
      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          postTask(project.id, { title: `Task ${i}` }).expect(201),
        ),
      );
      expect(
        responses.map(({ body }) => body.number).sort((a, b) => a - b),
      ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(new Set(responses.map(({ body }) => body.id)).size).toBe(8);
      expect(
        await prisma.task.count({ where: { projectId: project.id } }),
      ).toBe(8);
      expect(
        await prisma.project.findUnique({ where: { id: project.id } }),
      ).toMatchObject({ lastTaskNumber: 8 });
    });

    it('既存番号と重複すれば409で拒否し、採番更新も取り消す', async () => {
      const project = await createProject();
      await createTask(project.id);
      // StudioでTaskだけを手動作成した場合のカウンター不整合を再現する。
      await prisma.project.update({
        where: { id: project.id },
        data: { lastTaskNumber: 0 },
      });
      const before = await readProjectState();
      await postTask(project.id).expect(409).expect({
        message: 'タスク番号が競合しました',
        error: 'Conflict',
        statusCode: 409,
      });
      expect(await readProjectState()).toEqual(before);
    });

    it('採番・Task保存後の失敗は両方を取り消し、次の成功で1を使う', async () => {
      const project = await createProject();
      const before = await readProjectState();
      const runTransaction = prisma.$transaction.bind(prisma);
      let changesSeen = false;
      app.useLogger(false);
      const spy = vi
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce((operation, options) =>
          runTransaction(async (tx) => {
            await operation(tx);
            const saved = await tx.project.findUniqueOrThrow({
              where: { id: project.id },
            });
            changesSeen =
              saved.lastTaskNumber === 1 &&
              (await tx.task.count({ where: { projectId: project.id } })) === 1;
            throw new Error('保存後の失敗時のrollbackを確認する');
          }, options),
        );
      try {
        await postTask(project.id).expect(500);
        expect(changesSeen).toBe(true);
        expect(await readProjectState()).toEqual(before);
      } finally {
        spy.mockRestore();
      }
      const { body } = await postTask(project.id).expect(201);
      expect(body.number).toBe(1);
    });

    // 固定sleepを使わず、対象のDB接続が実際にロック待ちになったことを確認する。
    async function waitForBlockedQuery(
      blockerPid: number,
      prefix: string,
      table: string,
    ) {
      return vi.waitUntil(
        async () => {
          const [waiting] = await prisma.$queryRaw<{ pid: number }[]>`
          SELECT pid FROM pg_stat_activity
          WHERE ${blockerPid}::integer = ANY(pg_blocking_pids(pid))
            AND query LIKE ${prefix + '%'} AND query LIKE ${'%' + table + '%'}
        `;
          return waiting?.pid;
        },
        { timeout: 3000, interval: 10 },
      );
    }

    it.each([
      'archive',
      'remove_creator',
      'demote_creator',
      'remove_assignee',
    ] as const)(
      'Projectロック待ちの間に%sが先に保存されたら最新状態で拒否する',
      async (operation) => {
        const project = await createProjectForRole('member');
        const target = await createOtherUser();
        await prisma.projectMember.create({
          data: { projectId: project.id, userId: target.id, role: 'viewer' },
        });
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
        const blocker = prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM projects WHERE id = ${project.id} FOR UPDATE`;
            if (operation === 'archive') {
              await tx.project.update({
                where: { id: project.id },
                data: { isArchived: true },
              });
            } else if (operation === 'demote_creator') {
              await tx.projectMember.update({
                where: { projectId_userId: { projectId: project.id, userId } },
                data: { role: 'viewer' },
              });
            } else {
              await tx.projectMember.delete({
                where: {
                  projectId_userId: {
                    projectId: project.id,
                    userId: operation === 'remove_creator' ? userId : target.id,
                  },
                },
              });
            }
            const [{ pid }] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            ready(pid);
            await gate;
          },
          { timeout: 10000 },
        );
        blocker.catch(rejectReady);
        let pending: Promise<request.Response> | undefined;
        try {
          const pid = await locked;
          pending = postTask(project.id, {
            title: 'Task',
            assigneeId: target.id,
          }).then((response) => response);
          pending.catch(() => {});
          await waitForBlockedQuery(pid, '%SELECT', 'projects');
          release();
          await blocker;
          const afterChange = await readProjectState();
          const response = await pending;
          expect(response.status).toBe(
            {
              archive: 409,
              remove_creator: 404,
              demote_creator: 403,
              remove_assignee: 400,
            }[operation],
          );
          expect(await readProjectState()).toEqual(afterChange);
          expect(afterChange[0]).toMatchObject({
            lastTaskNumber: 0,
            tasks: [],
          });
        } finally {
          release();
          await Promise.allSettled([blocker, ...(pending ? [pending] : [])]);
        }
      },
      15000,
    );

    it.each(['remove_assignee', 'archive'] as const)(
      '作成が先にProjectをロックした場合は%sが完了まで待つ',
      async (operation) => {
        const project = await createProject();
        const target = await createOtherUser();
        const member = await prisma.projectMember.create({
          data: { projectId: project.id, userId: target.id, role: 'member' },
        });
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
        const blocker = prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`LOCK TABLE tasks IN SHARE MODE`;
            const [{ pid }] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            ready(pid);
            await gate;
          },
          { timeout: 10000 },
        );
        blocker.catch(rejectReady);
        let pendingCreate: Promise<request.Response> | undefined;
        let pendingChange: Promise<request.Response> | undefined;
        try {
          const pid = await locked;
          pendingCreate = postTask(project.id, {
            title: 'Task',
            assigneeId: target.id,
          })
            .expect(201)
            .then((response) => response);
          pendingCreate.catch(() => {});
          const creatorPid = await waitForBlockedQuery(pid, 'INSERT', 'tasks');
          pendingChange = (
            operation === 'remove_assignee'
              ? request(app.getHttpServer()).delete(
                  `/api/projects/${project.id}/members/${member.id}`,
                )
              : request(app.getHttpServer()).post(
                  `/api/projects/${project.id}/archive`,
                )
          )
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(operation === 'remove_assignee' ? 204 : 200)
            .then((response) => response);
          pendingChange.catch(() => {});
          await waitForBlockedQuery(
            creatorPid,
            operation === 'archive' ? 'UPDATE' : '%SELECT',
            'projects',
          );
          release();
          await blocker;
          const [created] = await Promise.all([pendingCreate, pendingChange]);
          expect(created.body.assignee.id).toBe(target.id);
          const saved = await prisma.task.findUniqueOrThrow({
            where: { id: created.body.id },
          });
          expect(saved).toMatchObject({
            number: 1,
            reporterId: userId,
            assigneeId: operation === 'remove_assignee' ? null : target.id,
          });
          expect(
            await prisma.project.findUnique({ where: { id: project.id } }),
          ).toMatchObject({
            lastTaskNumber: 1,
            isArchived: operation === 'archive',
          });
        } finally {
          release();
          await Promise.allSettled([
            blocker,
            ...(pendingCreate ? [pendingCreate] : []),
            ...(pendingChange ? [pendingChange] : []),
          ]);
        }
      },
      15000,
    );

    it('作成者がProjectを脱退しても報告者への参照を保持する', async () => {
      const project = await createProjectForRole('member');
      const { body } = await postTask(project.id).expect(201);
      await prisma.projectMember.delete({
        where: { projectId_userId: { projectId: project.id, userId } },
      });
      const saved = await prisma.task.findUniqueOrThrow({
        where: { id: body.id },
        include: { reporter: true },
      });
      expect(saved.reporter.id).toBe(userId);
      await postTask(project.id).expect(404).expect(projectNotFound);
    });
  });

  it.each([
    ['tokenなし', undefined],
    ['Bearer形式ではないヘッダー', 'Basic'],
    ['無効なtoken', 'Bearer invalid-token'],
  ])(
    '%sは401で拒否し、Project・参加情報・Taskを変更しない',
    async (_caseName, authorization) => {
      const project = await createProject();
      await createTask(project.id);
      const before = await readProjectState();

      const listRequest = request(app.getHttpServer()).get(
        `/api/projects/${project.id}/tasks`,
      );
      if (authorization) {
        listRequest.set(
          'Authorization',
          authorization === 'Basic' ? `Basic ${accessToken}` : authorization,
        );
      }
      await listRequest.expect(401);

      expect(await readProjectState()).toEqual(before);
    },
  );

  it.each([
    ['メール未設定', { email: undefined }],
    ['メール未確認', { email_confirmed_at: undefined }],
  ])(
    'token検証後に%sなら403で拒否し、UserとProject内のデータを変更しない',
    async (_caseName, emailState) => {
      const project = await createProject();
      await createTask(project.id);
      const before = await readProjectState();
      const userBefore = await prisma.user.findUnique({
        where: { id: userId },
      });
      const authService = app.get(AuthService);
      const verifiedUser = await authService.verifyAccessToken(accessToken);

      // 通常の認証ケースは実Supabaseを使う。この2件だけ検証結果のメール状態を変え、
      // ログイン時に拒否される状態でも、API側のメール確認を検証する。
      vi.spyOn(authService, 'verifyAccessToken').mockResolvedValueOnce({
        ...verifiedUser,
        ...emailState,
      });

      await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403)
        .expect({
          message: '確認済みのメールアドレスが必要です。',
          error: 'Forbidden',
          statusCode: 403,
        });

      expect(await readProjectState()).toEqual(before);
      expect(await prisma.user.findUnique({ where: { id: userId } })).toEqual(
        userBefore,
      );
    },
  );

  it.each([
    { role: 'owner', isArchived: false },
    { role: 'member', isArchived: false },
    { role: 'viewer', isArchived: false },
    { role: 'owner', isArchived: true },
    { role: 'member', isArchived: true },
    { role: 'viewer', isArchived: true },
  ] as const)(
    '$roleはisArchived=$isArchivedでも合意した項目だけでTask一覧を取得できる',
    async ({ role, isArchived }) => {
      const project = await createProjectForRole(role, isArchived);
      const task = await createTask(project.id, {
        title: 'ログイン画面を作る',
        description: 'メールアドレスとパスワードでログインする',
        status: 'in_progress',
        priority: 'high',
        startDate: new Date('2026-10-26T00:00:00.000Z'),
        dueDate: new Date('2026-10-30T00:00:00.000Z'),
        createdAt: new Date('2026-10-25T15:00:00.123Z'),
        updatedAt: new Date('2026-10-26T09:00:00.456Z'),
      });
      const before = await readProjectState();

      const response = await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual([
        {
          id: task.id,
          projectId: project.id,
          number: task.number,
          title: 'ログイン画面を作る',
          description: 'メールアドレスとパスワードでログインする',
          status: 'in_progress',
          priority: 'high',
          assignee: null,
          reporter: { id: project.ownerId, name: null },
          startDate: '2026-10-26',
          dueDate: '2026-10-30',
          createdAt: '2026-10-25T15:00:00.123Z',
          updatedAt: '2026-10-26T09:00:00.456Z',
        },
      ]);
      expect(await readProjectState()).toEqual(before);
    },
  );

  it.each(['owner', 'member', 'viewer'] as const)(
    '%sの参加ProjectにTaskがなければ200と空配列を返す',
    async (role) => {
      const project = await createProjectForRole(role);
      const before = await readProjectState();

      await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect([]);

      expect(await readProjectState()).toEqual(before);
    },
  );

  it('未設定のdescription・担当者・日付はnull、報告者はオブジェクトで返し、status・priorityの初期値はtodo・normalで返す', async () => {
    const project = await createProject();
    const task = await createTask(project.id);
    const before = await readProjectState();

    const response = await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual([
      {
        id: task.id,
        projectId: project.id,
        number: task.number,
        title: 'Fixture Task',
        description: null,
        status: 'todo',
        priority: 'normal',
        assignee: null,
        reporter: { id: project.ownerId, name: null },
        startDate: null,
        dueDate: null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      },
    ]);
    expect(await readProjectState()).toEqual(before);
  });

  it('報告者をnullにする更新をDB制約で拒否し、Taskの値を保持する', async () => {
    const project = await createProject();
    const task = await createTask(project.id);
    const before = await readProjectState();

    await expect(
      prisma.$executeRaw`UPDATE "tasks" SET "reporter_id" = NULL WHERE "id" = ${task.id}`,
    ).rejects.toMatchObject({
      code: 'P2010',
      meta: {
        driverAdapterError: {
          cause: { kind: 'NullConstraintViolation', originalCode: '23502' },
        },
      },
    });

    expect(await readProjectState()).toEqual(before);
  });

  it.each(['一覧', '詳細'] as const)(
    '%sで担当者・報告者はIDと名前だけを返し、脱退済みの報告者と未設定の名前も保持する',
    async (target) => {
      const project = await createProject();
      const assignee = await createOtherUser();
      const reporter = await createOtherUser();
      await prisma.user.update({
        where: { id: assignee.id },
        data: { name: '担当者の表示名' },
      });
      await prisma.projectMember.createMany({
        data: [
          { projectId: project.id, userId: assignee.id, role: 'member' },
          { projectId: project.id, userId: reporter.id, role: 'member' },
        ],
      });
      const task = await createTask(project.id, {
        title: '担当付きのTask',
        assigneeId: assignee.id,
        reporterId: reporter.id,
      });
      await prisma.projectMember.delete({
        where: {
          projectId_userId: { projectId: project.id, userId: reporter.id },
        },
      });
      const before = await readProjectState();
      const path = `/api/projects/${project.id}/tasks`;

      const response = await request(app.getHttpServer())
        .get(target === '一覧' ? path : `${path}/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      const expected = {
        id: task.id,
        projectId: project.id,
        number: 1,
        title: '担当付きのTask',
        description: null,
        status: 'todo',
        priority: 'normal',
        assignee: { id: assignee.id, name: '担当者の表示名' },
        reporter: { id: reporter.id, name: null },
        startDate: null,
        dueDate: null,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      };
      expect(response.body).toEqual(target === '一覧' ? [expected] : expected);
      expect(await readProjectState()).toEqual(before);
    },
  );

  it.each([
    { startDate: '2028-02-29', dueDate: null },
    { startDate: null, dueDate: '2027-01-01' },
    { startDate: '2026-12-31', dueDate: '2026-12-31' },
  ])(
    '日付だけの値を維持し、startDate=$startDate・dueDate=$dueDateで返す',
    async ({ startDate, dueDate }) => {
      const project = await createProject();
      await createTask(project.id, {
        title: 'Date Task',
        startDate: startDate ? new Date(`${startDate}T00:00:00.000Z`) : null,
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : null,
      });
      const before = await readProjectState();

      const response = await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({ startDate, dueDate });
      expect(await readProjectState()).toEqual(before);
    },
  );

  it('作成日時の降順、同じ日時ならIDの降順で返す', async () => {
    const project = await createProject();
    const idPrefix = `task-sort-${randomUUID()}`;
    const sameDateA = await createTask(project.id, {
      id: `${idPrefix}-a`,
      title: 'Same Date A',
      status: 'done',
      priority: 'high',
      createdAt: new Date('2026-10-26T00:00:00.000Z'),
    });
    const newest = await createTask(project.id, {
      title: 'Newest',
      priority: 'low',
      createdAt: new Date('2026-10-27T00:00:00.000Z'),
    });
    const oldest = await createTask(project.id, {
      title: 'Oldest',
      createdAt: new Date('2026-10-25T00:00:00.000Z'),
    });
    const sameDateZ = await createTask(project.id, {
      id: `${idPrefix}-z`,
      title: 'Same Date Z',
      status: 'in_progress',
      createdAt: new Date('2026-10-26T00:00:00.000Z'),
    });
    const before = await readProjectState();

    const response = await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.map((task: { id: string }) => task.id)).toEqual([
      newest.id,
      sameDateZ.id,
      sameDateA.id,
      oldest.id,
    ]);
    expect(await readProjectState()).toEqual(before);
  });

  it('両Projectのownerでも、URLで指定したProjectのTaskだけを返す', async () => {
    const firstProject = await createProject();
    const secondProject = await createProject();
    const firstTask = await createTask(firstProject.id);
    const secondTask = await createTask(secondProject.id);
    const before = await readProjectState();

    for (const [project, task] of [
      [firstProject, firstTask],
      [secondProject, secondTask],
    ] as const) {
      const response = await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: task.id,
        projectId: project.id,
      });
    }
    expect(await readProjectState()).toEqual(before);
  });

  it.each([false, true])(
    '非参加ProjectはisArchived=%sでも存在しないIDと同じ404で拒否する',
    async (isArchived) => {
      const joinedProject = await createProject();
      await createTask(joinedProject.id);
      const otherUser = await createOtherUser();
      const otherProject = await createProject(otherUser.id, isArchived);
      await createTask(otherProject.id);
      const before = await readProjectState();

      for (const projectId of [otherProject.id, 'not-found']) {
        await request(app.getHttpServer())
          .get(`/api/projects/${projectId}/tasks`)
          // queryにownerのIDを送っても、tokenの本人として認可する。
          .query({ userId: otherUser.id })
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404)
          .expect(projectNotFound);
      }
      expect(await readProjectState()).toEqual(before);
    },
  );

  it.each([false, true])(
    'ownerIdが本人でも、参加情報がなければisArchived=%sでも404で拒否する',
    async (isArchived) => {
      const project = await createProject(userId, isArchived);
      await createTask(project.id);
      await prisma.projectMember.deleteMany({
        where: { projectId: project.id, userId },
      });
      const before = await readProjectState();

      await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404)
        .expect(projectNotFound);

      expect(await readProjectState()).toEqual(before);
    },
  );

  it('一度取得できても、参加情報が削除された後は同じtokenで404になる', async () => {
    const project = await createProjectForRole('viewer');
    await createTask(project.id);

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await prisma.projectMember.deleteMany({
      where: { projectId: project.id, userId },
    });
    const before = await readProjectState();

    await request(app.getHttpServer())
      .get(`/api/projects/${project.id}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404)
      .expect(projectNotFound);

    expect(await readProjectState()).toEqual(before);
  });

  describe('Task詳細: GET /api/projects/:projectId/tasks/:taskId', () => {
    it.each([
      ['tokenなし', undefined],
      ['Bearer形式ではないヘッダー', 'Basic'],
      ['無効なtoken', 'Bearer invalid-token'],
    ])(
      '%sは401で拒否し、Project・参加情報・Taskを変更しない',
      async (_caseName, authorization) => {
        const project = await createProject();
        const task = await createTask(project.id);
        const before = await readProjectState();

        const detailRequest = request(app.getHttpServer()).get(
          `/api/projects/${project.id}/tasks/${task.id}`,
        );
        if (authorization) {
          detailRequest.set(
            'Authorization',
            authorization === 'Basic' ? `Basic ${accessToken}` : authorization,
          );
        }
        await detailRequest.expect(401);

        expect(await readProjectState()).toEqual(before);
      },
    );

    it.each([
      ['メール未設定', { email: undefined }],
      ['メール未確認', { email_confirmed_at: undefined }],
    ])(
      'token検証後に%sなら403で拒否し、UserとProject内のデータを変更しない',
      async (_caseName, emailState) => {
        const project = await createProject();
        const task = await createTask(project.id);
        const before = await readProjectState();
        const userBefore = await prisma.user.findUnique({
          where: { id: userId },
        });
        const authService = app.get(AuthService);
        const verifiedUser = await authService.verifyAccessToken(accessToken);

        // メール条件のテストだけ、実tokenの検証結果のメール状態を差し替える。
        vi.spyOn(authService, 'verifyAccessToken').mockResolvedValueOnce({
          ...verifiedUser,
          ...emailState,
        });

        await request(app.getHttpServer())
          .get(`/api/projects/${project.id}/tasks/${task.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403)
          .expect({
            message: '確認済みのメールアドレスが必要です。',
            error: 'Forbidden',
            statusCode: 403,
          });

        expect(await readProjectState()).toEqual(before);
        expect(await prisma.user.findUnique({ where: { id: userId } })).toEqual(
          userBefore,
        );
      },
    );

    it.each([
      { role: 'owner', isArchived: false },
      { role: 'member', isArchived: false },
      { role: 'viewer', isArchived: false },
      { role: 'owner', isArchived: true },
      { role: 'member', isArchived: true },
      { role: 'viewer', isArchived: true },
    ] as const)(
      '$roleはisArchived=$isArchivedでもTaskを1件取得できる',
      async ({ role, isArchived }) => {
        const project = await createProjectForRole(role, isArchived);
        const task = await createTask(project.id);
        const before = await readProjectState();

        const response = await request(app.getHttpServer())
          .get(`/api/projects/${project.id}/tasks/${task.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect('Content-Type', /json/)
          .expect((response) => {
            expect(response.status, JSON.stringify(response.body)).toBe(200);
          });

        expect(response.body).toEqual({
          id: task.id,
          projectId: project.id,
          number: task.number,
          title: 'Fixture Task',
          description: null,
          status: 'todo',
          priority: 'normal',
          assignee: null,
          reporter: { id: project.ownerId, name: null },
          startDate: null,
          dueDate: null,
          createdAt: task.createdAt.toISOString(),
          updatedAt: task.updatedAt.toISOString(),
        });
        expect(await readProjectState()).toEqual(before);
      },
    );

    it('説明・日付が設定されたTaskを合意した13項目・日付形式で返す', async () => {
      const project = await createProject();
      const task = await createTask(project.id, {
        title: 'ログイン画面を作る',
        description: 'メールアドレスとパスワードでログインする',
        status: 'in_progress',
        priority: 'high',
        startDate: new Date('2026-10-29T00:00:00.000Z'),
        dueDate: new Date('2026-11-02T00:00:00.000Z'),
        createdAt: new Date('2026-10-28T15:00:00.123Z'),
        updatedAt: new Date('2026-10-29T09:00:00.456Z'),
      });
      const before = await readProjectState();

      const response = await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toEqual({
        id: task.id,
        projectId: project.id,
        number: task.number,
        title: 'ログイン画面を作る',
        description: 'メールアドレスとパスワードでログインする',
        status: 'in_progress',
        priority: 'high',
        assignee: null,
        reporter: { id: project.ownerId, name: null },
        startDate: '2026-10-29',
        dueDate: '2026-11-02',
        createdAt: '2026-10-28T15:00:00.123Z',
        updatedAt: '2026-10-29T09:00:00.456Z',
      });
      expect(await readProjectState()).toEqual(before);
    });

    it('両Projectのownerでも、別ProjectのTaskは存在しないTaskと同じ404になる', async () => {
      const firstProject = await createProject();
      const secondProject = await createProject();
      await createTask(firstProject.id);
      const secondTask = await createTask(secondProject.id);
      const before = await readProjectState();

      for (const taskId of [secondTask.id, 'not-found']) {
        await request(app.getHttpServer())
          .get(`/api/projects/${firstProject.id}/tasks/${taskId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404)
          .expect({
            message: 'タスクが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });

        expect(await readProjectState()).toEqual(before);
      }
    });

    it('非参加ProjectのTaskは存在しないProjectと同じ404で拒否する', async () => {
      const otherUser = await createOtherUser();
      const otherProject = await createProject(otherUser.id);
      const task = await createTask(otherProject.id);
      const before = await readProjectState();

      for (const projectId of [otherProject.id, 'not-found']) {
        await request(app.getHttpServer())
          .get(`/api/projects/${projectId}/tasks/${task.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404)
          .expect(projectNotFound);

        expect(await readProjectState()).toEqual(before);
      }
    });

    it('ownerIdが本人でも、参加情報の削除後は同じtokenで404になる', async () => {
      const project = await createProject();
      const task = await createTask(project.id);

      await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await prisma.projectMember.deleteMany({
        where: { projectId: project.id, userId },
      });

      // 取得による変更は、参加情報を削除した後の状態と比較する。
      const before = await readProjectState();
      expect(before[0]).toMatchObject({
        id: project.id,
        ownerId: userId,
        projectMembers: [],
      });

      await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404)
        .expect(projectNotFound);

      expect(await readProjectState()).toEqual(before);
    });
  });
});
