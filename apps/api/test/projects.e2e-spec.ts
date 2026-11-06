import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';
import { ProjectsRepository } from '../src/modules/projects/projects.repository.js';

// describe は、同じ機能に関するテストをひとまとまりにする。
describe('Projects endpoint', () => {
  let app: INestApplication;
  let appCreated = false;
  let projectKey: string;
  let projectKeys: string[];
  let adminClient: SupabaseClient;
  // テスト用の Project の ownerId と Authorization ヘッダーで使う。
  let userId: string;
  let accessToken: string;
  let otherUserIds: string[];

  // beforeEach は各テストの前に実行され、新しいNestJSアプリを用意する。
  beforeEach(async () => {
    // 準備中に失敗しても、前のテストのユーザーを削除しないよう初期化する。
    appCreated = false;
    projectKeys = [];
    userId = '';
    accessToken = '';
    otherUserIds = [];

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
    await app.init();

    // テストごとに一意なkeyを作り、既存データとの重複を避ける。
    projectKey = `E2E${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    projectKeys = [projectKey];

    const supabaseUrl = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !secretKey || !publishableKey) {
      throw new Error(
        'テスト用の Supabase URL、Secret key、Publishable key が必要です。',
      );
    }

    // 管理 API でユーザーを作成・削除するため、ローカルの Supabase に限定する。
    const url = new URL(supabaseUrl);
    if (
      url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    ) {
      throw new Error(
        'Projects E2E はローカルの Supabase で実行してください。',
      );
    }

    // Secret key はユーザー管理に、Publishable key はログインに使う。
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

    // テストごとに確認済みの一時ユーザーを作る。
    const email = `projects-e2e-${randomUUID()}@example.test`;
    const password = `E2e!${randomBytes(24).toString('hex')}`;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    // 後続処理が失敗しても afterEach で削除できるよう、先に ID を記録する。
    userId = data.user?.id ?? '';
    if (error) {
      throw error;
    }
    expect(userId).toBeTruthy();
    expect(data.user?.email_confirmed_at).toBeTruthy();

    const { data: signInData, error: signInError } =
      await loginClient.auth.signInWithPassword({ email, password });
    if (signInError) {
      throw signInError;
    }
    expect(signInData.user?.id).toBe(userId);

    // 各テストから使えるよう、ログイン後の access token を保持する。
    accessToken = signInData.session?.access_token ?? '';
    expect(accessToken).toBeTruthy();

    // 本物の token を検証し、E2E 専用 DB にアプリ側の User を作成する。
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(response.status, JSON.stringify(response.body?.message)).toBe(200);
    expect(response.body).toMatchObject({ id: userId, email });
  });

  // afterEach は各テストの後に実行され、テスト用データとアプリを片付ける。
  afterEach(async () => {
    if (!appCreated) {
      return;
    }

    const prisma = app.get(PrismaService);
    try {
      // 今回作成したProjectのTask・参加情報から順に、外部キーの参照元を片付ける。
      await prisma.task.deleteMany({
        where: { project: { key: { in: projectKeys } } },
      });
      await prisma.projectMember.deleteMany({
        where: { project: { key: { in: projectKeys } } },
      });
      await prisma.project.deleteMany({
        where: { key: { in: projectKeys } },
      });
    } finally {
      try {
        const userIds = [userId, ...otherUserIds].filter(Boolean);
        if (userIds.length > 0) {
          try {
            // User 作成前に準備が失敗していた場合も、deleteMany なら実行できる。
            await prisma.user.deleteMany({ where: { id: { in: userIds } } });
          } finally {
            // アプリ側の削除が失敗した場合も、Supabase 側の削除を試みる。
            const results = await Promise.allSettled(
              userIds.map((id) => adminClient.auth.admin.deleteUser(id)),
            );
            for (const result of results) {
              expect(
                result,
                'テストユーザーの削除に失敗しました。',
              ).toMatchObject({ status: 'fulfilled', value: { error: null } });
            }
          }
        }
      } finally {
        await app.close();
      }
    }
  });

  // member・viewer の参加先と非参加 Project の作成者。
  async function createOtherUser() {
    const email = `projects-e2e-${randomUUID()}@example.test`;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password: `E2e!${randomBytes(24).toString('hex')}`,
      email_confirm: true,
    });
    // DB 保存に失敗しても、Supabase のユーザーを後片付けできるよう記録する。
    if (data.user) {
      otherUserIds.push(data.user.id);
    }
    if (error) {
      throw error;
    }
    if (!data.user) {
      throw new Error('テストユーザーを作成できませんでした。');
    }

    return app.get(PrismaService).user.create({
      data: { id: data.user.id, email },
    });
  }

  describe('一覧取得: GET /api/projects', () => {
    it.each([
      ['token なし', undefined],
      ['無効な token', 'invalid-token'],
    ])('一覧取得時に%sを401で拒否する', async (_caseName, token) => {
      // データが存在していても、認証できなければ一覧を返さない。
      await app.get(PrismaService).project.create({
        data: { ownerId: userId, name: 'Project List', key: projectKey },
      });

      const listRequest = request(app.getHttpServer()).get('/api/projects');
      if (token) {
        listRequest.set('Authorization', `Bearer ${token}`);
      }

      await listRequest.expect(401);
    });

    it.each(['owner', 'member', 'viewer'] as const)(
      '%sとして参加しているプロジェクトを取得する',
      async (role) => {
        const ownerId =
          role === 'owner' ? userId : (await createOtherUser()).id;
        const project = await app.get(PrismaService).project.create({
          data: {
            ownerId,
            name: 'Joined Project',
            key: projectKey,
            projectMembers: {
              create:
                role === 'owner'
                  ? [{ userId, role }]
                  : [
                      { userId: ownerId, role: 'owner' },
                      { userId, role },
                    ],
            },
          },
        });

        const response = await request(app.getHttpServer())
          .get('/api/projects')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        expect(response.body).toEqual([
          expect.objectContaining({ id: project.id, ownerId, key: projectKey }),
        ]);
        expect(response.body[0]).not.toHaveProperty('lastTaskNumber');
      },
    );

    it('参加していないプロジェクトは一覧に含めない', async () => {
      const otherUser = await createOtherUser();
      const otherProjectKey = projectKey.replace('E2E', 'OTH');
      projectKeys.push(otherProjectKey);

      const prisma = app.get(PrismaService);
      const joinedProject = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Joined Project',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
      });
      await prisma.project.create({
        data: {
          ownerId: otherUser.id,
          name: 'Other Project',
          key: otherProjectKey,
          projectMembers: { create: { userId: otherUser.id, role: 'owner' } },
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(response.body).toEqual([
        expect.objectContaining({ id: joinedProject.id }),
      ]);
    });

    it('参加プロジェクトがなければ200と空配列を返す', async () => {
      const otherUser = await createOtherUser();
      await app.get(PrismaService).project.create({
        data: {
          ownerId: otherUser.id,
          name: 'Other Project',
          key: projectKey,
          projectMembers: { create: { userId: otherUser.id, role: 'owner' } },
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('ownerIdが本人でも参加情報がなければ一覧に含めない', async () => {
      // ownerId だけで許可せず、ProjectMember を認可の根拠にする。
      await app.get(PrismaService).project.create({
        data: { ownerId: userId, name: 'No Membership', key: projectKey },
      });

      const response = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(response.body).toEqual([]);
    });

    it('アーカイブ済みのプロジェクトも取得する', async () => {
      const archivedProjectKey = projectKey.replace('E2E', 'ARC');
      projectKeys.push(archivedProjectKey);

      // アーカイブ済みプロジェクトも一覧に含まれることを確認する。
      await app.get(PrismaService).project.create({
        data: {
          ownerId: userId,
          name: 'Archived Project',
          key: archivedProjectKey,
          isArchived: true,
          projectMembers: { create: { userId, role: 'owner' } },
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: archivedProjectKey,
            isArchived: true,
          }),
        ]),
      );
    });

    it('プロジェクト一覧を作成日時の新しい順に取得する', async () => {
      const olderProjectKey = projectKey.replace('E2E', 'OLD');
      const newerProjectKey = projectKey.replace('E2E', 'NEW');
      projectKeys.push(olderProjectKey, newerProjectKey);

      // createdAt を固定し、実行速度に左右されず並び順を確認できるようにする。
      await app.get(PrismaService).project.create({
        data: {
          ownerId: userId,
          name: 'Older Project',
          key: olderProjectKey,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          projectMembers: { create: { userId, role: 'owner' } },
        },
      });
      await app.get(PrismaService).project.create({
        data: {
          ownerId: userId,
          name: 'Newer Project',
          key: newerProjectKey,
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          projectMembers: { create: { userId, role: 'owner' } },
        },
      });

      const response = await request(app.getHttpServer())
        .get('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const projectKeysInResponse = response.body.map(
        (project: { key: string }) => project.key,
      );

      expect(projectKeysInResponse).toEqual(
        expect.arrayContaining([olderProjectKey, newerProjectKey]),
      );
      expect(projectKeysInResponse.indexOf(newerProjectKey)).toBeLessThan(
        projectKeysInResponse.indexOf(olderProjectKey),
      );
    });
  });

  describe('詳細取得: GET /api/projects/:projectId', () => {
    it.each([
      ['token なし', undefined],
      ['無効な token', 'invalid-token'],
    ])('詳細取得時に%sを401で拒否する', async (_caseName, token) => {
      const project = await app.get(PrismaService).project.create({
        data: { ownerId: userId, name: 'Project Detail', key: projectKey },
      });

      // 存在する ID を指定し、404 ではなく認証エラーになることを確認する。
      const detailRequest = request(app.getHttpServer()).get(
        `/api/projects/${project.id}`,
      );
      if (token) {
        detailRequest.set('Authorization', `Bearer ${token}`);
      }

      await detailRequest.expect(401);
    });

    it.each(['owner', 'member', 'viewer'] as const)(
      '%sとして参加しているProjectの詳細と本人のroleを返し、内部の参加情報を含めない',
      async (role) => {
        const ownerId =
          role === 'owner' ? userId : (await createOtherUser()).id;
        const project = await app.get(PrismaService).project.create({
          data: {
            ownerId,
            name: 'Project Detail',
            key: projectKey,
            description: '詳細取得用のテストデータ',
            projectMembers: {
              create:
                role === 'owner'
                  ? [{ userId, role }]
                  : [
                      { userId: ownerId, role: 'owner' },
                      { userId, role },
                    ],
            },
          },
        });

        const response = await request(app.getHttpServer())
          .get(`/api/projects/${project.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        // 既存の Project 項目と本人の role だけを返すことを確認する。
        expect(response.body).toEqual({
          id: project.id,
          ownerId,
          name: 'Project Detail',
          key: projectKey,
          description: '詳細取得用のテストデータ',
          isArchived: false,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString(),
          currentUserRole: role,
        });
      },
    );

    it('別Projectに参加していても非参加のProjectは存在しないIDと同じ404で拒否し、Projectと参加情報を変更しない', async () => {
      const otherUser = await createOtherUser();
      const otherProjectKey = projectKey.replace('E2E', 'OTH');
      projectKeys.push(otherProjectKey);

      const prisma = app.get(PrismaService);
      await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Joined Project',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
      });
      const otherProject = await prisma.project.create({
        data: {
          ownerId: otherUser.id,
          name: 'Other Project',
          key: otherProjectKey,
          description: '非参加者に公開しない説明',
          projectMembers: { create: { userId: otherUser.id, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      const notFoundResponse = await request(app.getHttpServer())
        .get('/api/projects/not-found')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      const response = await request(app.getHttpServer())
        .get(`/api/projects/${otherProject.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      // 存在の有無を、status やエラー本文から区別できないことを確認する。
      expect(response.body).toEqual(notFoundResponse.body);
      expect(response.body).toEqual({
        message: 'プロジェクトが見つかりません',
        error: 'Not Found',
        statusCode: 404,
      });
      // AuthGuard による User の同期とは別に、対象の値・更新日時は変わらない。
      expect(
        await prisma.project.findUnique({
          where: { id: otherProject.id },
          include: { projectMembers: true },
        }),
      ).toEqual(otherProject);
    });

    it('ownerIdが本人でも参加情報がなければ404で拒否する', async () => {
      const project = await app.get(PrismaService).project.create({
        data: { ownerId: userId, name: 'No Membership', key: projectKey },
      });

      await request(app.getHttpServer())
        .get(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404)
        .expect({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
    });

    it('viewerも参加しているアーカイブ済みProjectの詳細を取得できる', async () => {
      const otherUser = await createOtherUser();
      const project = await app.get(PrismaService).project.create({
        data: {
          ownerId: otherUser.id,
          name: 'Archived Project Detail',
          key: projectKey,
          isArchived: true,
          projectMembers: {
            create: [
              { userId: otherUser.id, role: 'owner' },
              { userId, role: 'viewer' },
            ],
          },
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        id: project.id,
        ownerId: otherUser.id,
        name: 'Archived Project Detail',
        key: projectKey,
        description: null,
        isArchived: true,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        currentUserRole: 'viewer',
      });
    });

    it('存在しないIDを指定すると404を返す', async () => {
      await request(app.getHttpServer())
        .get('/api/projects/not-found')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404)
        .expect({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
    });
  });

  describe('メンバー一覧取得: GET /api/projects/:projectId/members', () => {
    it.each([
      ['token なし', undefined],
      ['Bearer 形式ではないヘッダー', 'Basic'],
      ['無効な token', 'Bearer invalid-token'],
    ])(
      'メンバー一覧取得時に%sを401で拒否し、Projectと参加情報を変更しない',
      async (_caseName, authorization) => {
        const prisma = app.get(PrismaService);
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Project Members',
            key: projectKey,
            projectMembers: { create: { userId, role: 'owner' } },
          },
          include: { projectMembers: true },
        });

        const listRequest = request(app.getHttpServer()).get(
          `/api/projects/${project.id}/members`,
        );
        if (authorization) {
          // 有効な token でも、Bearer 以外の形式なら拒否される。
          listRequest.set(
            'Authorization',
            authorization === 'Basic' ? `Basic ${accessToken}` : authorization,
          );
        }

        await listRequest.expect(401);
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: true },
          }),
        ).toEqual(project);
      },
    );

    it('ownerは本人を含む全roleのメンバー一覧を合意した項目だけで取得でき、未設定の名前はnullで返す', async () => {
      const prisma = app.get(PrismaService);
      const owner = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      const otherUser = await createOtherUser();
      // 他の参加者の表示情報は、アプリ側 User に保存した値を返す。
      const member = await prisma.user.update({
        where: { id: otherUser.id },
        data: { name: '山田太郎' },
      });
      const viewer = await createOtherUser();
      const project = await prisma.project.create({
        data: { ownerId: userId, name: 'Project Members', key: projectKey },
      });
      const ownerMembership = await prisma.projectMember.create({
        data: { projectId: project.id, userId, role: 'owner' },
      });
      const memberMembership = await prisma.projectMember.create({
        data: { projectId: project.id, userId: member.id, role: 'member' },
      });
      const viewerMembership = await prisma.projectMember.create({
        data: { projectId: project.id, userId: viewer.id, role: 'viewer' },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // toEqual で、projectId・updatedAt や User の内部情報も含まれないことを確認する。
      expect(response.body).toEqual([
        {
          id: ownerMembership.id,
          userId,
          role: 'owner',
          createdAt: ownerMembership.createdAt.toISOString(),
          user: { name: null, email: owner.email },
        },
        {
          id: memberMembership.id,
          userId: member.id,
          role: 'member',
          createdAt: memberMembership.createdAt.toISOString(),
          user: { name: '山田太郎', email: member.email },
        },
        {
          id: viewerMembership.id,
          userId: viewer.id,
          role: 'viewer',
          createdAt: viewerMembership.createdAt.toISOString(),
          user: { name: null, email: viewer.email },
        },
      ]);
    });

    it('ownerを先頭にし、他のメンバーはroleにかかわらず参加日時・IDの昇順で返す', async () => {
      const prisma = app.get(PrismaService);
      const viewer = await createOtherUser();
      const newerMember = await createOtherUser();
      const sameDateMemberZ = await createOtherUser();
      const sameDateViewerA = await createOtherUser();
      const project = await prisma.project.create({
        data: { ownerId: userId, name: 'Sorted Members', key: projectKey },
      });
      const idPrefix = projectKey.toLowerCase();

      // 登録順・ID順・日時順だけでは、期待する並びにならないデータを用意する。
      // owner は最新でも先頭にし、他の参加者は role より参加日時・ID を優先する。
      await prisma.projectMember.createMany({
        data: [
          {
            id: `${idPrefix}-viewer`,
            projectId: project.id,
            userId: viewer.id,
            role: 'viewer',
            createdAt: new Date('2026-10-01T10:00:00.000Z'),
          },
          {
            id: `${idPrefix}-member-0`,
            projectId: project.id,
            userId: newerMember.id,
            role: 'member',
            createdAt: new Date('2026-10-03T10:00:00.000Z'),
          },
          {
            id: `${idPrefix}-same-date-z`,
            projectId: project.id,
            userId: sameDateMemberZ.id,
            role: 'member',
            createdAt: new Date('2026-10-02T10:00:00.000Z'),
          },
          {
            id: `${idPrefix}-owner`,
            projectId: project.id,
            userId,
            role: 'owner',
            createdAt: new Date('2026-10-04T10:00:00.000Z'),
          },
          {
            id: `${idPrefix}-same-date-a`,
            projectId: project.id,
            userId: sameDateViewerA.id,
            role: 'viewer',
            createdAt: new Date('2026-10-02T10:00:00.000Z'),
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.map((member: { id: string }) => member.id)).toEqual([
        `${idPrefix}-owner`,
        `${idPrefix}-viewer`,
        `${idPrefix}-same-date-a`,
        `${idPrefix}-same-date-z`,
        `${idPrefix}-member-0`,
      ]);
    });

    it.each([
      ['member', 'viewer'],
      ['viewer', 'member'],
    ] as const)(
      '権限変更後も一覧の位置を保つ（%s→%s）',
      async (initialRole, nextRole) => {
        const prisma = app.get(PrismaService);
        const targetUser = await createOtherUser();
        const otherUser = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Stable Member Order',
            key: projectKey,
            projectMembers: {
              create: {
                userId,
                role: 'owner',
                createdAt: new Date('2026-10-04T10:00:00.000Z'),
              },
            },
          },
          include: { projectMembers: true },
        });
        const targetMember = await prisma.projectMember.create({
          data: {
            projectId: project.id,
            userId: targetUser.id,
            role: initialRole,
            createdAt: new Date('2026-10-01T10:00:00.000Z'),
            updatedAt: new Date('2020-01-01T00:00:00.000Z'),
          },
        });
        const otherMember = await prisma.projectMember.create({
          data: {
            projectId: project.id,
            userId: otherUser.id,
            role: 'member',
            createdAt: new Date('2026-10-02T10:00:00.000Z'),
          },
        });

        const before = await request(app.getHttpServer())
          .get(`/api/projects/${project.id}/members`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        const memberIdsBefore = before.body.map(
          (member: { id: string }) => member.id,
        );
        expect(memberIdsBefore).toEqual([
          project.projectMembers[0].id,
          targetMember.id,
          otherMember.id,
        ]);

        await request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${targetMember.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role: nextRole })
          .expect(200);

        const after = await request(app.getHttpServer())
          .get(`/api/projects/${project.id}/members`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        expect(after.body.map((member: { id: string }) => member.id)).toEqual(
          memberIdsBefore,
        );
        expect(after.body[1]).toMatchObject({
          id: targetMember.id,
          role: nextRole,
        });

        const savedMember = await prisma.projectMember.findUniqueOrThrow({
          where: { id: targetMember.id },
        });
        expect(savedMember.createdAt).toEqual(targetMember.createdAt);
        expect(savedMember.updatedAt).not.toEqual(targetMember.updatedAt);
      },
    );

    it('同じownerの別Projectの参加情報をメンバー一覧に含めない', async () => {
      const prisma = app.get(PrismaService);
      const otherUser = await createOtherUser();
      const otherProjectKey = projectKey.replace('E2E', 'OTH');
      projectKeys.push(otherProjectKey);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Project Members',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });
      await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Other Project Members',
          key: otherProjectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              { userId: otherUser.id, role: 'member' },
            ],
          },
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        id: project.projectMembers[0].id,
        userId,
        role: 'owner',
      });
    });

    it.each([
      { role: 'owner', isArchived: false },
      { role: 'member', isArchived: false },
      { role: 'viewer', isArchived: false },
      { role: 'owner', isArchived: true },
      { role: 'member', isArchived: true },
      { role: 'viewer', isArchived: true },
    ] as const)(
      '$roleはisArchived=$isArchivedでもメンバー一覧を取得でき、Projectと参加情報を変更しない',
      async ({ role, isArchived }) => {
        const otherUser = await createOtherUser();
        const prisma = app.get(PrismaService);
        const currentUser = await prisma.user.findUniqueOrThrow({
          where: { id: userId },
        });
        const ownerId = role === 'owner' ? userId : otherUser.id;
        const project = await prisma.project.create({
          data: {
            ownerId,
            name: 'Project Members',
            key: projectKey,
            isArchived,
            projectMembers: {
              create: [
                { userId: ownerId, role: 'owner' },
                {
                  userId: role === 'owner' ? otherUser.id : userId,
                  role: role === 'owner' ? 'member' : role,
                },
              ],
            },
          },
          include: { projectMembers: { orderBy: { role: 'asc' } } },
        });

        const response = await request(app.getHttpServer())
          .get(`/api/projects/${project.id}/members`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        // 返却されるのは本人だけでなく、owner を含む Project 内の全メンバー。
        expect(response.body).toEqual(
          project.projectMembers.map((member) => ({
            id: member.id,
            userId: member.userId,
            role: member.role,
            createdAt: member.createdAt.toISOString(),
            user: {
              name: null,
              email:
                member.userId === userId ? currentUser.email : otherUser.email,
            },
          })),
        );

        // AuthGuard による User の同期とは別に、値と更新日時を比較する。
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { role: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it('別Projectのownerでも非参加のProjectは存在しないIDと同じ404で拒否し、両Projectと参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const otherUser = await createOtherUser();
      const otherProjectKey = projectKey.replace('E2E', 'OTH');
      projectKeys.push(otherProjectKey);
      const joinedProject = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Joined Project',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });
      const otherProject = await prisma.project.create({
        data: {
          ownerId: otherUser.id,
          name: 'Other Project',
          key: otherProjectKey,
          projectMembers: { create: { userId: otherUser.id, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      // 存在しない ID と非参加 Project のどちらも、同じ本文で拒否する。
      for (const projectId of ['not-found', otherProject.id]) {
        await request(app.getHttpServer())
          .get(`/api/projects/${projectId}/members`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404)
          .expect({
            message: 'プロジェクトが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });

        for (const before of [joinedProject, otherProject]) {
          expect(
            await prisma.project.findUnique({
              where: { id: before.id },
              include: { projectMembers: true },
            }),
          ).toEqual(before);
        }
      }
    });

    it('ownerIdが本人でも参加情報がなければ404で拒否し、Projectを変更しない', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: { ownerId: userId, name: 'No Membership', key: projectKey },
        include: { projectMembers: true },
      });

      await request(app.getHttpServer())
        .get(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404)
        .expect({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual(project);
    });
  });

  describe('メンバー追加: POST /api/projects/:projectId/members', () => {
    it.each([
      ['token なし', undefined],
      ['Bearer 形式ではないヘッダー', 'Basic'],
      ['無効な token', 'Bearer invalid-token'],
    ])(
      'メンバー追加時に%sを401で拒否し、Projectと参加情報を変更しない',
      async (_caseName, authorization) => {
        const prisma = app.get(PrismaService);
        const targetUser = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Add Project Member',
            key: projectKey,
            projectMembers: { create: { userId, role: 'owner' } },
          },
          include: { projectMembers: true },
        });
        const addRequest = request(app.getHttpServer()).post(
          `/api/projects/${project.id}/members`,
        );
        if (authorization) {
          addRequest.set(
            'Authorization',
            authorization === 'Basic' ? `Basic ${accessToken}` : authorization,
          );
        }

        await addRequest
          .send({ email: targetUser.email, role: 'member' })
          .expect(401);

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: true },
          }),
        ).toEqual(project);
      },
    );

    it.each([
      ['member', '山田太郎'],
      ['viewer', null],
    ] as const)(
      'ownerは登録済みUserを%sとして追加し、201の返却項目とDB保存を確認できる',
      async (role, name) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const targetUser = await prisma.user.update({
          where: { id: target.id },
          data: { name },
        });
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Add Project Member',
            key: projectKey,
            projectMembers: { create: { userId, role: 'owner' } },
          },
          include: { projectMembers: true },
        });

        const response = await request(app.getHttpServer())
          .post(`/api/projects/${project.id}/members`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ email: `  ${targetUser.email}  `, role })
          .expect(201);

        const savedMember = await prisma.projectMember.findUniqueOrThrow({
          where: {
            projectId_userId: { projectId: project.id, userId: targetUser.id },
          },
        });
        expect(savedMember).toMatchObject({
          projectId: project.id,
          userId: targetUser.id,
          role,
        });
        // 内部項目は返さず、アプリ側 User の名前・メールを返す。
        expect(response.body).toEqual({
          id: savedMember.id,
          userId: targetUser.id,
          role,
          createdAt: savedMember.createdAt.toISOString(),
          user: { name, email: targetUser.email },
        });

        const savedProject = await prisma.project.findUniqueOrThrow({
          where: { id: project.id },
          include: { projectMembers: true },
        });
        expect(savedProject.projectMembers).toHaveLength(2);
        // Project の値・更新日時と、既存の owner の参加情報を維持する。
        expect(savedProject).toEqual({
          ...project,
          projectMembers: expect.arrayContaining([
            ...project.projectMembers,
            savedMember,
          ]),
        });
      },
    );

    it('別Projectに参加済みのUserも追加でき、そのProjectと参加情報は変更しない', async () => {
      const prisma = app.get(PrismaService);
      const targetUser = await createOtherUser();
      const otherProjectKey = projectKey.replace('E2E', 'OTH');
      projectKeys.push(otherProjectKey);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Add Project Member',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });
      const otherProject = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Other Membership',
          key: otherProjectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              { userId: targetUser.id, role: 'member' },
            ],
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });

      await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: targetUser.email, role: 'viewer' })
        .expect(201);

      const savedMember = await prisma.projectMember.findUniqueOrThrow({
        where: {
          projectId_userId: { projectId: project.id, userId: targetUser.id },
        },
      });
      expect(savedMember.role).toBe('viewer');
      const savedProject = await prisma.project.findUniqueOrThrow({
        where: { id: project.id },
        include: { projectMembers: true },
      });
      expect(savedProject.projectMembers).toHaveLength(2);
      expect(savedProject).toEqual({
        ...project,
        projectMembers: expect.arrayContaining([
          ...project.projectMembers,
          savedMember,
        ]),
      });
      expect(
        await prisma.project.findUnique({
          where: { id: otherProject.id },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(otherProject);
    });

    it.each([
      { role: 'member', isArchived: false },
      { role: 'viewer', isArchived: false },
      { role: 'member', isArchived: true },
      { role: 'viewer', isArchived: true },
    ] as const)(
      '$roleによる追加をisArchived=$isArchivedでも403で拒否し、Projectと参加情報を変更しない',
      async ({ role, isArchived }) => {
        const prisma = app.get(PrismaService);
        const owner = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: owner.id,
            name: 'Forbidden Member Addition',
            key: projectKey,
            isArchived,
            projectMembers: {
              create: [
                { userId: owner.id, role: 'owner' },
                { userId, role },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });

        // 対象 User が存在しなくても、先に本人の owner 権限を確認する。
        await request(app.getHttpServer())
          .post(`/api/projects/${project.id}/members`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            email: `missing-${randomUUID()}@example.test`,
            role: 'member',
          })
          .expect(403)
          .expect({
            message: 'プロジェクトに参加者を追加する権限がありません',
            error: 'Forbidden',
            statusCode: 403,
          });

        // User のプロフィール同期は含めず、値と更新日時を比較する。
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it('別Projectのownerでも非参加のProjectへの追加は存在しないIDと同じ404になり、両Projectと参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const otherUser = await createOtherUser();
      const otherProjectKey = projectKey.replace('E2E', 'OTH');
      projectKeys.push(otherProjectKey);
      const joinedProject = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Joined Project',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });
      const otherProject = await prisma.project.create({
        data: {
          ownerId: otherUser.id,
          name: 'Other Project',
          key: otherProjectKey,
          projectMembers: { create: { userId: otherUser.id, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      for (const projectId of ['not-found', otherProject.id]) {
        await request(app.getHttpServer())
          .post(`/api/projects/${projectId}/members`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ email: otherUser.email, role: 'member' })
          .expect(404)
          .expect({
            message: 'プロジェクトが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });

        for (const before of [joinedProject, otherProject]) {
          expect(
            await prisma.project.findUnique({
              where: { id: before.id },
              include: { projectMembers: true },
            }),
          ).toEqual(before);
        }
      }
    });

    it('ownerIdが本人でも参加情報がなければ追加を404で拒否し、Projectを変更しない', async () => {
      const prisma = app.get(PrismaService);
      const targetUser = await createOtherUser();
      const project = await prisma.project.create({
        data: { ownerId: userId, name: 'No Membership', key: projectKey },
        include: { projectMembers: true },
      });

      await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: targetUser.email, role: 'member' })
        .expect(404)
        .expect({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual(project);
    });

    it('追加対象のUserが存在しなければ404で拒否し、Projectと参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Missing Target User',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });
      const email = `missing-${randomUUID()}@example.test`;

      await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email, role: 'member' })
        .expect(404)
        .expect({
          message: '追加対象のユーザーが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });

      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual(project);
    });

    it('Supabase Authだけに登録されているUserは404で拒否し、アプリ側Userや参加情報を作成しない', async () => {
      const prisma = app.get(PrismaService);
      const targetUser = await createOtherUser();
      // Supabase の登録は維持し、アプリ側 User が未作成の状態にする。
      await prisma.user.delete({ where: { id: targetUser.id } });
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Auth Only Target',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: targetUser.email, role: 'viewer' })
        .expect(404)
        .expect({
          message: '追加対象のユーザーが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });

      expect(
        await prisma.user.findUnique({ where: { id: targetUser.id } }),
      ).toBeNull();
      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual(project);
    });

    it('メールアドレスの大文字・小文字が一致しなければ404で拒否し、Projectと参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const targetUser = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Case Sensitive Email',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });
      const email = targetUser.email.toUpperCase();
      expect(email).not.toBe(targetUser.email);

      await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email, role: 'member' })
        .expect(404)
        .expect({
          message: '追加対象のユーザーが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual(project);
    });

    it('ownerでもアーカイブ済みProjectへの追加は409で拒否し、Projectと参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const targetUser = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Archived Member Addition',
          key: projectKey,
          isArchived: true,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: targetUser.email, role: 'member' })
        .expect(409)
        .expect({
          message: 'アーカイブ済みのプロジェクトにメンバーを追加できません',
          error: 'Conflict',
          statusCode: 409,
        });

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual(project);
    });

    it('事前確認の後にアーカイブが完了した場合は追加を409で拒否し、アーカイブ後のProjectと参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const repository = app.get(ProjectsRepository);
      const targetUser = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Archive Before Member Save',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      // Service の事前確認が終わった後、Repository の保存処理に入る直前で待たせる。
      // 認証と DB 操作は実処理を使い、固定時間の待機で順序を決めない。
      let resumeSave = () => {};
      const saveGate = new Promise<void>((resolve) => {
        resumeSave = resolve;
      });
      const createProjectMember =
        repository.createProjectMember.bind(repository);
      const saveSpy = vi
        .spyOn(repository, 'createProjectMember')
        .mockImplementationOnce(async (data) => {
          await saveGate;
          return createProjectMember(data);
        });
      const pendingAdd = request(app.getHttpServer())
        .post(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: targetUser.email, role: 'member' })
        .then((response) => response);
      // 途中の検証が失敗しても、未処理の Promise rejection にしない。
      pendingAdd.catch(() => {});

      try {
        await vi.waitFor(
          () =>
            expect(saveSpy).toHaveBeenCalledExactlyOnceWith({
              projectId: project.id,
              userId: targetUser.id,
              role: 'member',
            }),
          { timeout: 3000, interval: 10 },
        );

        await request(app.getHttpServer())
          .post(`/api/projects/${project.id}/archive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        const archivedProject = await prisma.project.findUniqueOrThrow({
          where: { id: project.id },
          include: { projectMembers: true },
        });
        expect(archivedProject.isArchived).toBe(true);
        expect(archivedProject.projectMembers).toEqual(project.projectMembers);

        resumeSave();
        const response = await pendingAdd;
        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          message: 'アーカイブ済みのプロジェクトにメンバーを追加できません',
          error: 'Conflict',
          statusCode: 409,
        });

        // 正当なアーカイブ更新の後から、追加による値・更新日時の変化がないことを確認する。
        // AuthGuard の User プロフィール同期は比較に含めない。
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: true },
          }),
        ).toEqual(archivedProject);
      } finally {
        // 失敗時も待機を解除し、HTTP 処理を終えてから spy と既存の後片付けに戻す。
        resumeSave();
        await Promise.allSettled([pendingAdd]);
        saveSpy.mockRestore();
      }
    });

    it('追加が先にProject行をロックした場合は保存までアーカイブが待機し、追加201・アーカイブ200で保存できる', async () => {
      const prisma = app.get(PrismaService);
      const targetUser = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Member Save Before Archive',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      let notifyBlockerReady = (_pid: number) => {};
      let rejectBlockerReady = (_error: unknown) => {};
      const blockerReady = new Promise<number>((resolve, reject) => {
        notifyBlockerReady = resolve;
        rejectBlockerReady = reject;
      });
      let resumeInsert = () => {};
      const insertGate = new Promise<void>((resolve) => {
        resumeInsert = resolve;
      });
      // テスト用の別 transaction で INSERT だけを待たせる。
      // 追加 API は実際に Project 行をロックし、そのロックを保持したまま保存待ちになる。
      const insertBlocker = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`LOCK TABLE project_members IN SHARE MODE`;
          const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`
            SELECT pg_backend_pid() AS pid
          `;
          notifyBlockerReady(pid);
          await insertGate;
        },
        { timeout: 10000 },
      );
      insertBlocker.catch(rejectBlockerReady);
      let pendingAdd: Promise<request.Response> | undefined;
      let pendingArchive: Promise<request.Response> | undefined;

      try {
        const blockerPid = await blockerReady;
        pendingAdd = request(app.getHttpServer())
          .post(`/api/projects/${project.id}/members`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ email: targetUser.email, role: 'member' })
          .expect(201)
          .then((response) => response);
        pendingAdd.catch(() => {});

        // INSERT が実際にロック待ちになった DB 接続を特定する。
        const additionPid = await vi.waitUntil(
          async () => {
            const [adding] = await prisma.$queryRaw<{ pid: number }[]>`
              SELECT pid FROM pg_stat_activity
              WHERE ${blockerPid}::integer = ANY(pg_blocking_pids(pid))
                AND query LIKE 'INSERT%'
                AND query LIKE '%project_members%'
            `;
            return adding?.pid;
          },
          { timeout: 3000, interval: 10 },
        );

        pendingArchive = request(app.getHttpServer())
          .post(`/api/projects/${project.id}/archive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
          .then((response) => response);
        pendingArchive.catch(() => {});

        // アーカイブの UPDATE が、追加 API の持つ Project 行ロックを待つことを確認する。
        await vi.waitUntil(
          async () => {
            const [state] = await prisma.$queryRaw<{ waiting: boolean }[]>`
              SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity
                WHERE ${additionPid}::integer = ANY(pg_blocking_pids(pid))
                  AND query LIKE 'UPDATE%'
                  AND query LIKE '%projects%'
              ) AS waiting
            `;
            return state.waiting;
          },
          { timeout: 3000, interval: 10 },
        );
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: true },
          }),
        ).toEqual(project);

        resumeInsert();
        await insertBlocker;
        const [added, archived] = await Promise.all([
          pendingAdd,
          pendingArchive,
        ]);
        const savedMember = await prisma.projectMember.findUniqueOrThrow({
          where: {
            projectId_userId: { projectId: project.id, userId: targetUser.id },
          },
        });
        expect(savedMember.role).toBe('member');
        expect(added.body).toEqual({
          id: savedMember.id,
          userId: targetUser.id,
          role: 'member',
          createdAt: savedMember.createdAt.toISOString(),
          user: { name: null, email: targetUser.email },
        });
        expect(archived.body).toMatchObject({
          id: project.id,
          isArchived: true,
        });
        const savedProject = await prisma.project.findUniqueOrThrow({
          where: { id: project.id },
          include: { projectMembers: true },
        });
        expect(savedProject.projectMembers).toHaveLength(2);
        expect(savedProject).toEqual({
          ...project,
          isArchived: true,
          updatedAt: expect.any(Date),
          projectMembers: expect.arrayContaining([
            ...project.projectMembers,
            savedMember,
          ]),
        });
      } finally {
        // 検証失敗時もテーブルロックと HTTP の待機を解除してから afterEach に進む。
        resumeInsert();
        await Promise.allSettled([insertBlocker, pendingAdd, pendingArchive]);
      }
    }, 15000);

    it.each(['owner', 'member', 'viewer'] as const)(
      '参加済みの%sへの追加を409で拒否し、既存のrole・値・更新日時を変更しない',
      async (existingRole) => {
        const prisma = app.get(PrismaService);
        const targetUser =
          existingRole === 'owner'
            ? await prisma.user.findUniqueOrThrow({ where: { id: userId } })
            : await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Duplicate Member Addition',
            key: projectKey,
            projectMembers: { create: { userId, role: 'owner' } },
          },
        });
        if (existingRole !== 'owner') {
          await prisma.projectMember.create({
            data: {
              projectId: project.id,
              userId: targetUser.id,
              role: existingRole,
            },
          });
        }
        const before = await prisma.project.findUniqueOrThrow({
          where: { id: project.id },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });

        // 既存とは異なる role を指定しても、追加 API では role を変更しない。
        await request(app.getHttpServer())
          .post(`/api/projects/${project.id}/members`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({
            email: targetUser.email,
            role: existingRole === 'member' ? 'viewer' : 'member',
          })
          .expect(409)
          .expect({
            message: '指定したユーザーはすでに参加しています',
            error: 'Conflict',
            statusCode: 409,
          });

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(before);
      },
    );

    it.each([
      ['emailの未指定', { email: undefined }],
      ['emailがnull', { email: null }],
      ['emailが数値', { email: 123 }],
      ['emailがboolean', { email: true }],
      ['emailがオブジェクト', { email: {} }],
      ['emailが配列', { email: ['member@example.test'] }],
      ['emailが空文字', { email: '' }],
      ['emailが空白のみ', { email: '   ' }],
      ['emailの形式不正', { email: 'invalid-email' }],
      ['roleの未指定', { role: undefined }],
      ['roleがnull', { role: null }],
      ['roleがowner', { role: 'owner' }],
      ['roleがmanager', { role: 'manager' }],
      ['roleが未定義の文字列', { role: 'invalid-role' }],
      ['roleが数値', { role: 123 }],
      ['roleがオブジェクト', { role: {} }],
      ['roleが配列', { role: ['member'] }],
      ['定義外のuserId', { userId: '11111111-1111-4111-8111-111111111111' }],
      ['空の本文', { email: undefined, role: undefined }],
    ] as const)(
      'メンバー追加時の%sを400で拒否し、Projectと参加情報を変更しない',
      async (_caseName, invalidBody) => {
        const prisma = app.get(PrismaService);
        const targetUser = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Invalid Member Addition',
            key: projectKey,
            projectMembers: { create: { userId, role: 'owner' } },
          },
          include: { projectMembers: true },
        });

        await request(app.getHttpServer())
          .post(`/api/projects/${project.id}/members`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ email: targetUser.email, role: 'member', ...invalidBody })
          .expect(400);

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: true },
          }),
        ).toEqual(project);
      },
    );

    it('同じUserの同時追加は201と409になり、参加情報を1件だけ保存して既存データを維持する', async () => {
      const prisma = app.get(PrismaService);
      const targetUser = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Concurrent Member Addition',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      const responses = await Promise.all(
        (['member', 'viewer'] as const).map((role) =>
          request(app.getHttpServer())
            .post(`/api/projects/${project.id}/members`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ email: targetUser.email, role }),
        ),
      );
      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      const success = responses.find((response) => response.status === 201);
      const conflict = responses.find((response) => response.status === 409);
      expect(conflict?.body).toEqual({
        message: '指定したユーザーはすでに参加しています',
        error: 'Conflict',
        statusCode: 409,
      });

      const savedMember = await prisma.projectMember.findUniqueOrThrow({
        where: {
          projectId_userId: { projectId: project.id, userId: targetUser.id },
        },
      });
      expect(['member', 'viewer']).toContain(savedMember.role);
      expect(success?.body).toEqual({
        id: savedMember.id,
        userId: targetUser.id,
        role: savedMember.role,
        createdAt: savedMember.createdAt.toISOString(),
        user: { name: null, email: targetUser.email },
      });
      expect(
        await prisma.projectMember.count({
          where: { projectId: project.id, userId: targetUser.id },
        }),
      ).toBe(1);
      const savedProject = await prisma.project.findUniqueOrThrow({
        where: { id: project.id },
        include: { projectMembers: true },
      });
      expect(savedProject.projectMembers).toHaveLength(2);
      expect(savedProject).toEqual({
        ...project,
        projectMembers: expect.arrayContaining([
          ...project.projectMembers,
          savedMember,
        ]),
      });
    });
  });

  describe('メンバーrole変更: PATCH /api/projects/:projectId/members/:memberId', () => {
    it.each([
      ['token なし', undefined],
      ['Bearer 形式ではないヘッダー', 'Basic'],
      ['無効な token', 'Bearer invalid-token'],
    ])(
      'role変更時に%sをDTO検証より先に401で拒否し、Projectと参加情報を変更しない',
      async (_caseName, authorization) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Unauthorized Role Change',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role: 'member' },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const member = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;
        const changeRequest = request(app.getHttpServer()).patch(
          `/api/projects/${project.id}/members/${member.id}`,
        );
        if (authorization) {
          changeRequest.set(
            'Authorization',
            authorization === 'Basic' ? `Basic ${accessToken}` : authorization,
          );
        }

        await changeRequest.send({ role: 'owner' }).expect(401);

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it.each([
      { beforeRole: 'member', role: 'viewer', name: '山田太郎' },
      { beforeRole: 'viewer', role: 'member', name: null },
    ] as const)(
      'ownerは$beforeRoleから$roleへ変更し、200の返却項目と対象だけのDB更新を確認できる',
      async ({ beforeRole, role, name }) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const targetUser = await prisma.user.update({
          where: { id: target.id },
          data: { name },
        });
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Update Member Role',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                {
                  userId: target.id,
                  role: beforeRole,
                  updatedAt: new Date('2020-01-01T00:00:00.000Z'),
                },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const member = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;
        const otherKey = projectKey.replace('E2E', 'OTH');
        projectKeys.push(otherKey);
        const otherProject = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Other Membership Of Same User',
            key: otherKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role: beforeRole },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });

        const response = await request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role })
          .expect(200);
        const savedMember = await prisma.projectMember.findUniqueOrThrow({
          where: { id: member.id },
        });
        expect(savedMember).toEqual({
          ...member,
          role,
          updatedAt: expect.any(Date),
        });
        expect(savedMember.updatedAt).not.toEqual(member.updatedAt);
        expect(response.body).toEqual({
          id: member.id,
          userId: target.id,
          role,
          createdAt: member.createdAt.toISOString(),
          user: { name, email: targetUser.email },
        });
        // Project と対象外の参加情報の値・更新日時を維持する。
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual({
          ...project,
          projectMembers: project.projectMembers.map((entry) =>
            entry.id === member.id ? savedMember : entry,
          ),
        });
        expect(
          await prisma.project.findUnique({
            where: { id: otherProject.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(otherProject);
      },
    );

    it.each(['member', 'viewer'] as const)(
      '同じroleの%sを指定すると200になり、Projectと参加情報の値・更新日時を維持する',
      async (role) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Unchanged Member Role',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                {
                  userId: target.id,
                  role,
                  updatedAt: new Date('2020-01-01T00:00:00.000Z'),
                },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const member = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;

        const response = await request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role })
          .expect(200);
        expect(response.body).toEqual({
          id: member.id,
          userId: target.id,
          role,
          createdAt: member.createdAt.toISOString(),
          user: { name: null, email: target.email },
        });
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it.each([
      { role: 'member', isArchived: false },
      { role: 'viewer', isArchived: false },
      { role: 'member', isArchived: true },
      { role: 'viewer', isArchived: true },
    ] as const)(
      '$roleによるrole変更はisArchived=$isArchivedでも対象確認より先に403で拒否する',
      async ({ role, isArchived }) => {
        const prisma = app.get(PrismaService);
        const owner = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: owner.id,
            name: 'Forbidden Role Change',
            key: projectKey,
            isArchived,
            projectMembers: {
              create: [
                { userId: owner.id, role: 'owner' },
                { userId, role },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const caller = project.projectMembers.find(
          (entry) => entry.userId === userId,
        )!;
        for (const memberId of ['not-found', caller.id]) {
          await request(app.getHttpServer())
            .patch(`/api/projects/${project.id}/members/${memberId}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ role })
            .expect(403)
            .expect({
              message:
                'プロジェクトのメンバーの role を変更する権限がありません',
              error: 'Forbidden',
              statusCode: 403,
            });
        }
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it.each([false, true])(
      'isArchived=%sでも非参加Projectと存在しないProjectのrole変更は同じ404で拒否する',
      async (isArchived) => {
        const prisma = app.get(PrismaService);
        const other = await createOtherUser();
        const otherKey = projectKey.replace('E2E', 'OTH');
        projectKeys.push(otherKey);
        const joinedProject = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Joined Project',
            key: projectKey,
            projectMembers: { create: { userId, role: 'owner' } },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const otherProject = await prisma.project.create({
          data: {
            ownerId: other.id,
            name: 'Unjoined Project',
            key: otherKey,
            isArchived,
            projectMembers: { create: { userId: other.id, role: 'owner' } },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        for (const projectId of ['not-found', otherProject.id]) {
          await request(app.getHttpServer())
            .patch(
              `/api/projects/${projectId}/members/${otherProject.projectMembers[0].id}`,
            )
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ role: 'member' })
            .expect(404)
            .expect({
              message: 'プロジェクトが見つかりません',
              error: 'Not Found',
              statusCode: 404,
            });
        }
        for (const before of [joinedProject, otherProject]) {
          expect(
            await prisma.project.findUnique({
              where: { id: before.id },
              include: { projectMembers: { orderBy: { id: 'asc' } } },
            }),
          ).toEqual(before);
        }
      },
    );

    it.each([false, true])(
      'isArchived=%sでownerIdが本人でも参加情報がなければrole変更は404になり、DBを変更しない',
      async (isArchived) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Owner Id Without Membership',
            key: projectKey,
            isArchived,
            projectMembers: { create: { userId: target.id, role: 'member' } },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        await request(app.getHttpServer())
          .patch(
            `/api/projects/${project.id}/members/${project.projectMembers[0].id}`,
          )
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role: 'viewer' })
          .expect(404)
          .expect({
            message: 'プロジェクトが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it.each(['存在しない参加情報ID', 'User.id'] as const)(
      '%sをmemberIdに指定すると対象404になり、Projectと参加情報を変更しない',
      async (caseName) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Missing Target Membership',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role: 'member' },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const memberId = caseName === 'User.id' ? target.id : 'not-found';
        await request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${memberId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role: 'viewer' })
          .expect(404)
          .expect({
            message: '変更対象のメンバーが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it('両Projectのownerでも別ProjectのmemberIdは対象404になり、同じUserの参加情報も変更しない', async () => {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const projects = [];
      for (const key of [projectKey, projectKey.replace('E2E', 'OTH')]) {
        if (!projectKeys.includes(key)) projectKeys.push(key);
        projects.push(
          await prisma.project.create({
            data: {
              ownerId: userId,
              name: 'Scoped Role Change',
              key,
              projectMembers: {
                create: [
                  { userId, role: 'owner' },
                  { userId: target.id, role: 'viewer' },
                ],
              },
            },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        );
      }
      const foreignMember = projects[1].projectMembers.find(
        (entry) => entry.userId === target.id,
      )!;
      await request(app.getHttpServer())
        .patch(`/api/projects/${projects[0].id}/members/${foreignMember.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ role: 'member' })
        .expect(404)
        .expect({
          message: '変更対象のメンバーが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
      for (const before of projects) {
        expect(
          await prisma.project.findUnique({
            where: { id: before.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(before);
      }
    });

    it.each(['member', 'viewer'] as const)(
      'owner自身を%sへ変更する操作は409で拒否し、Projectと参加情報を変更しない',
      async (role) => {
        const prisma = app.get(PrismaService);
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Protected Owner Role',
            key: projectKey,
            projectMembers: { create: { userId, role: 'owner' } },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        await request(app.getHttpServer())
          .patch(
            `/api/projects/${project.id}/members/${project.projectMembers[0].id}`,
          )
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role })
          .expect(409)
          .expect({
            message: 'owner の role は変更できません',
            error: 'Conflict',
            statusCode: 409,
          });
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it.each([
      { targetRole: 'member', role: 'viewer' },
      { targetRole: 'member', role: 'member' },
      { targetRole: 'viewer', role: 'viewer' },
      { targetRole: 'owner', role: 'member' },
      { targetRole: 'missing', role: 'member' },
    ] as const)(
      'アーカイブ済みなら対象$targetRoleへの$role指定を対象確認より先に409で拒否する',
      async ({ targetRole, role }) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Archived Role Change',
            key: projectKey,
            isArchived: true,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                {
                  userId: target.id,
                  role: targetRole === 'viewer' ? 'viewer' : 'member',
                },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const memberId =
          targetRole === 'missing'
            ? 'not-found'
            : project.projectMembers.find((entry) => entry.role === targetRole)!
                .id;
        await request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${memberId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role })
          .expect(409)
          .expect({
            message:
              'アーカイブ済みのプロジェクトではメンバーの role を変更できません',
            error: 'Conflict',
            statusCode: 409,
          });
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it.each([
      ['roleの未指定', { role: undefined }],
      ['roleがnull', { role: null }],
      ['roleがowner', { role: 'owner' }],
      ['roleがmanager', { role: 'manager' }],
      ['roleが未定義の文字列', { role: 'other' }],
      ['roleが空文字', { role: '' }],
      ['roleが空白のみ', { role: ' ' }],
      ['roleに前後空白がある', { role: ' member ' }],
      ['roleが大文字', { role: 'MEMBER' }],
      ['roleが数値', { role: 123 }],
      ['roleがboolean', { role: true }],
      ['roleがオブジェクト', { role: {} }],
      ['roleが配列', { role: ['member'] }],
      ['定義外のuserId', { userId: '11111111-1111-4111-8111-111111111111' }],
      ['定義外のownerId', { ownerId: '11111111-1111-4111-8111-111111111111' }],
      ['定義外のprojectId', { projectId: 'other-project' }],
      ['定義外のmemberId', { memberId: 'other-member' }],
      ['定義外のemail', { email: 'member@example.test' }],
    ] as const)(
      'role変更時の%sを400で拒否し、Projectと参加情報を変更しない',
      async (_caseName, invalidBody) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Invalid Role Change',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role: 'member' },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const member = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;
        await request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role: 'viewer', ...invalidBody })
          .expect(400);
        // AuthGuard が同期する User のプロフィールは比較に含めない。
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it.each(['member', 'viewer', '非参加者'] as const)(
      '%sでも不正なroleはmembership・アーカイブ・対象確認より先に400になる',
      async (role) => {
        const prisma = app.get(PrismaService);
        const owner = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: owner.id,
            name: 'Validate Before Authorization',
            key: projectKey,
            isArchived: true,
            projectMembers: {
              create: [
                { userId: owner.id, role: 'owner' },
                ...(role === '非参加者' ? [] : [{ userId, role }]),
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        await request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/not-found`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role: 'owner' })
          .expect(400);
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );
    it.each(['Project', 'ProjectMember'] as const)(
      '事前確認後に%sが削除された場合も保存時に404を返し、その後のDBを変更しない',
      async (resource) => {
        const prisma = app.get(PrismaService);
        const repository = app.get(ProjectsRepository);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Missing Resource Before Role Save',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role: 'member' },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const member = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;
        let resumeSave = () => {};
        const saveGate = new Promise<void>((resolve) => {
          resumeSave = resolve;
        });
        const updateRole = repository.updateProjectMemberRole.bind(repository);
        const saveSpy = vi
          .spyOn(repository, 'updateProjectMemberRole')
          .mockImplementationOnce(async (data) => {
            await saveGate;
            return updateRole(data);
          });
        const pendingChange = request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role: 'viewer' })
          .then((response) => response);
        pendingChange.catch(() => {});
        try {
          await vi.waitFor(
            () =>
              expect(saveSpy).toHaveBeenCalledExactlyOnceWith({
                projectId: project.id,
                projectMemberId: member.id,
                role: 'viewer',
              }),
            { timeout: 3000, interval: 10 },
          );
          if (resource === 'Project') {
            await prisma.projectMember.deleteMany({
              where: { projectId: project.id },
            });
            await prisma.project.delete({ where: { id: project.id } });
          } else {
            await prisma.projectMember.delete({ where: { id: member.id } });
          }
          const afterDeletion = await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          });
          const memberCount = await prisma.projectMember.count({
            where: { projectId: project.id },
          });
          resumeSave();
          const response = await pendingChange;
          expect(response.status).toBe(404);
          expect(response.body).toEqual({
            message:
              resource === 'Project'
                ? 'プロジェクトが見つかりません'
                : '変更対象のメンバーが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });
          expect(
            await prisma.project.findUnique({
              where: { id: project.id },
              include: { projectMembers: { orderBy: { id: 'asc' } } },
            }),
          ).toEqual(afterDeletion);
          expect(
            await prisma.projectMember.count({
              where: { projectId: project.id },
            }),
          ).toBe(memberCount);
        } finally {
          resumeSave();
          await Promise.allSettled([pendingChange]);
          saveSpy.mockRestore();
        }
      },
    );

    it.each(['member', 'viewer'] as const)(
      '事前確認後にアーカイブが完了した場合は%s指定を409で拒否し、アーカイブ後の値・更新日時を維持する',
      async (role) => {
        const prisma = app.get(PrismaService);
        const repository = app.get(ProjectsRepository);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Archive Before Role Save',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role: 'member' },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const member = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;
        // 同じ role の場合も Service が早期成功せず、保存時の再確認に到達する。
        let resumeSave = () => {};
        const saveGate = new Promise<void>((resolve) => {
          resumeSave = resolve;
        });
        const updateRole = repository.updateProjectMemberRole.bind(repository);
        const saveSpy = vi
          .spyOn(repository, 'updateProjectMemberRole')
          .mockImplementationOnce(async (data) => {
            await saveGate;
            return updateRole(data);
          });
        const pendingChange = request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role })
          .then((response) => response);
        pendingChange.catch(() => {});
        try {
          await vi.waitFor(
            () =>
              expect(saveSpy).toHaveBeenCalledExactlyOnceWith({
                projectId: project.id,
                projectMemberId: member.id,
                role,
              }),
            { timeout: 3000, interval: 10 },
          );
          await request(app.getHttpServer())
            .post(`/api/projects/${project.id}/archive`)
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);
          const archivedProject = await prisma.project.findUniqueOrThrow({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          });
          expect(archivedProject.isArchived).toBe(true);
          expect(archivedProject.projectMembers).toEqual(
            project.projectMembers,
          );
          resumeSave();
          const response = await pendingChange;
          expect(response.status).toBe(409);
          expect(response.body).toEqual({
            message:
              'アーカイブ済みのプロジェクトではメンバーの role を変更できません',
            error: 'Conflict',
            statusCode: 409,
          });
          expect(
            await prisma.project.findUnique({
              where: { id: project.id },
              include: { projectMembers: { orderBy: { id: 'asc' } } },
            }),
          ).toEqual(archivedProject);
        } finally {
          resumeSave();
          await Promise.allSettled([pendingChange]);
          saveSpy.mockRestore();
        }
      },
    );

    it('role変更が先にProject行をロックした場合は保存までアーカイブが待機し、両方200で成功する', async () => {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Role Save Before Archive',
          key: projectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              {
                userId: target.id,
                role: 'member',
                updatedAt: new Date('2020-01-01T00:00:00.000Z'),
              },
            ],
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const member = project.projectMembers.find(
        (entry) => entry.userId === target.id,
      )!;
      let notifyBlockerReady = (_pid: number) => {};
      let rejectBlockerReady = (_error: unknown) => {};
      const blockerReady = new Promise<number>((resolve, reject) => {
        notifyBlockerReady = resolve;
        rejectBlockerReady = reject;
      });
      let resumeMember = () => {};
      const memberGate = new Promise<void>((resolve) => {
        resumeMember = resolve;
      });
      // 対象の参加情報だけをロックし、API が Project 行を保持したまま UPDATE を待つ状態にする。
      const memberBlocker = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM project_members WHERE id = ${member.id} FOR UPDATE`;
          const [{ pid }] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          notifyBlockerReady(pid);
          await memberGate;
        },
        { timeout: 10000 },
      );
      memberBlocker.catch(rejectBlockerReady);
      let pendingChange: Promise<request.Response> | undefined;
      let pendingArchive: Promise<request.Response> | undefined;
      try {
        const blockerPid = await blockerReady;
        pendingChange = request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role: 'viewer' })
          .expect(200)
          .then((response) => response);
        pendingChange.catch(() => {});
        const changePid = await vi.waitUntil(
          async () => {
            const [changing] = await prisma.$queryRaw<{ pid: number }[]>`
            SELECT pid FROM pg_stat_activity
            WHERE ${blockerPid}::integer = ANY(pg_blocking_pids(pid))
              AND query LIKE 'UPDATE%' AND query LIKE '%project_members%'
          `;
            return changing?.pid;
          },
          { timeout: 3000, interval: 10 },
        );
        pendingArchive = request(app.getHttpServer())
          .post(`/api/projects/${project.id}/archive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
          .then((response) => response);
        pendingArchive.catch(() => {});
        await vi.waitUntil(
          async () => {
            const [state] = await prisma.$queryRaw<{ waiting: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE ${changePid}::integer = ANY(pg_blocking_pids(pid))
                AND query LIKE 'UPDATE%' AND query LIKE '%projects%'
            ) AS waiting
          `;
            return state.waiting;
          },
          { timeout: 3000, interval: 10 },
        );
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);

        resumeMember();
        await memberBlocker;
        const [changed, archived] = await Promise.all([
          pendingChange,
          pendingArchive,
        ]);
        expect(changed.body).toEqual({
          id: member.id,
          userId: target.id,
          role: 'viewer',
          createdAt: member.createdAt.toISOString(),
          user: { name: null, email: target.email },
        });
        expect(archived.body).toMatchObject({
          id: project.id,
          isArchived: true,
        });
        const savedMember = await prisma.projectMember.findUniqueOrThrow({
          where: { id: member.id },
        });
        expect(savedMember).toEqual({
          ...member,
          role: 'viewer',
          updatedAt: expect.any(Date),
        });
        expect(savedMember.updatedAt).not.toEqual(member.updatedAt);
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual({
          ...project,
          isArchived: true,
          updatedAt: new Date(archived.body.updatedAt),
          projectMembers: project.projectMembers.map((entry) =>
            entry.id === member.id ? savedMember : entry,
          ),
        });
      } finally {
        resumeMember();
        await Promise.allSettled([
          memberBlocker,
          pendingChange,
          pendingArchive,
        ]);
      }
    }, 15000);

    it.each(['member', 'viewer'] as const)(
      '同時role変更はProject行ロックの順で処理し、後の%s指定が最新のroleに対して適用される',
      async (secondRole) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Concurrent Member Role Changes',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                {
                  userId: target.id,
                  role: 'member',
                  updatedAt: new Date('2020-01-01T00:00:00.000Z'),
                },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const member = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;
        let notifyBlockerReady = (_pid: number) => {};
        let rejectBlockerReady = (_error: unknown) => {};
        const blockerReady = new Promise<number>((resolve, reject) => {
          notifyBlockerReady = resolve;
          rejectBlockerReady = reject;
        });
        let resumeMember = () => {};
        const memberGate = new Promise<void>((resolve) => {
          resumeMember = resolve;
        });
        const memberBlocker = prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM project_members WHERE id = ${member.id} FOR UPDATE`;
            const [{ pid }] = await tx.$queryRaw<
              { pid: number }[]
            >`SELECT pg_backend_pid() AS pid`;
            notifyBlockerReady(pid);
            await memberGate;
          },
          { timeout: 10000 },
        );
        memberBlocker.catch(rejectBlockerReady);
        let pendingFirst: Promise<request.Response> | undefined;
        let pendingSecond: Promise<request.Response> | undefined;
        try {
          const blockerPid = await blockerReady;
          pendingFirst = request(app.getHttpServer())
            .patch(`/api/projects/${project.id}/members/${member.id}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ role: 'viewer' })
            .expect(200)
            .then((response) => response);
          pendingFirst.catch(() => {});
          const firstPid = await vi.waitUntil(
            async () => {
              const [changing] = await prisma.$queryRaw<{ pid: number }[]>`
              SELECT pid FROM pg_stat_activity
              WHERE ${blockerPid}::integer = ANY(pg_blocking_pids(pid))
                AND query LIKE 'UPDATE%' AND query LIKE '%project_members%'
            `;
              return changing?.pid;
            },
            { timeout: 3000, interval: 10 },
          );
          pendingSecond = request(app.getHttpServer())
            .patch(`/api/projects/${project.id}/members/${member.id}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ role: secondRole })
            .expect(200)
            .then((response) => response);
          pendingSecond.catch(() => {});
          // 2件目が同じ role を事前に読んでも、Project 行のロック待ちを省略できない。
          await vi.waitUntil(
            async () => {
              const [state] = await prisma.$queryRaw<{ waiting: boolean }[]>`
              SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity
                WHERE ${firstPid}::integer = ANY(pg_blocking_pids(pid))
                  AND query LIKE '%FOR UPDATE%'
              ) AS waiting
            `;
              return state.waiting;
            },
            { timeout: 3000, interval: 10 },
          );
          expect(
            await prisma.project.findUnique({
              where: { id: project.id },
              include: { projectMembers: { orderBy: { id: 'asc' } } },
            }),
          ).toEqual(project);

          resumeMember();
          await memberBlocker;
          const [first, second] = await Promise.all([
            pendingFirst,
            pendingSecond,
          ]);
          for (const [response, role] of [
            [first, 'viewer'],
            [second, secondRole],
          ] as const) {
            expect(response.body).toEqual({
              id: member.id,
              userId: target.id,
              role,
              createdAt: member.createdAt.toISOString(),
              user: { name: null, email: target.email },
            });
          }
          const savedMember = await prisma.projectMember.findUniqueOrThrow({
            where: { id: member.id },
          });
          expect(savedMember).toEqual({
            ...member,
            role: secondRole,
            updatedAt: expect.any(Date),
          });
          expect(savedMember.updatedAt).not.toEqual(member.updatedAt);
          expect(
            await prisma.project.findUnique({
              where: { id: project.id },
              include: { projectMembers: { orderBy: { id: 'asc' } } },
            }),
          ).toEqual({
            ...project,
            projectMembers: project.projectMembers.map((entry) =>
              entry.id === member.id ? savedMember : entry,
            ),
          });
        } finally {
          resumeMember();
          await Promise.allSettled([
            memberBlocker,
            pendingFirst,
            pendingSecond,
          ]);
        }
      },
      15000,
    );
  });

  describe('メンバー削除: DELETE /api/projects/:projectId/members/:memberId', () => {
    async function createTaskAssignmentProject({
      requesterRole = 'owner',
      targetRole = 'member',
      isArchived = false,
    }: {
      requesterRole?: 'owner' | 'member' | 'viewer' | null;
      targetRole?: 'member' | 'viewer';
      isArchived?: boolean;
    } = {}) {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const ownerId =
        requesterRole === 'owner' ? userId : (await createOtherUser()).id;
      const previousTime = new Date('2025-01-01T00:00:00.000Z');
      const project = await prisma.project.create({
        data: {
          ownerId,
          key: projectKey,
          name: 'Task Assignment Member Deletion',
          isArchived,
          lastTaskNumber: 5,
          projectMembers: {
            create: [
              { userId: ownerId, role: 'owner' },
              { userId: target.id, role: targetRole },
              ...(requesterRole && requesterRole !== 'owner'
                ? [{ userId, role: requesterRole }]
                : []),
            ],
          },
          tasks: {
            create: [
              ...(['todo', 'in_progress', 'done'] as const).map(
                (status, index) => ({
                  number: index + 1,
                  title: `Assigned ${status}`,
                  status,
                  assigneeId: target.id,
                  reporterId: target.id,
                  createdAt: previousTime,
                  updatedAt: previousTime,
                }),
              ),
              {
                number: 4,
                title: 'Another assignee',
                assigneeId: ownerId,
                reporterId: target.id,
                createdAt: previousTime,
                updatedAt: previousTime,
              },
              {
                number: 5,
                title: 'Unassigned',
                assigneeId: null,
                reporterId: target.id,
                createdAt: previousTime,
                updatedAt: previousTime,
              },
            ],
          },
        },
        include: {
          projectMembers: { orderBy: { id: 'asc' } },
          tasks: { orderBy: { id: 'asc' } },
        },
      });
      const member = project.projectMembers.find(
        (entry) => entry.userId === target.id,
      )!;
      return { prisma, project, member, target };
    }

    function readTaskAssignmentProject(projectId: string) {
      return app.get(PrismaService).project.findUniqueOrThrow({
        where: { id: projectId },
        include: {
          projectMembers: { orderBy: { id: 'asc' } },
          tasks: { orderBy: { id: 'asc' } },
        },
      });
    }

    it.each(['member', 'viewer'] as const)(
      '%sの削除で対象Projectの担当だけを解除し、完了状態・報告者・他Projectの担当を保持する',
      async (targetRole) => {
        const { prisma, project, member, target } =
          await createTaskAssignmentProject({ targetRole });
        const otherKey = projectKey.replace('E2E', 'OTH');
        projectKeys.push(otherKey);
        const otherProject = await prisma.project.create({
          data: {
            ownerId: userId,
            key: otherKey,
            name: 'Keep Other Project Assignment',
            lastTaskNumber: 1,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role: 'member' },
              ],
            },
            tasks: {
              create: {
                number: 1,
                title: 'Keep assignment',
                assigneeId: target.id,
                reporterId: target.id,
              },
            },
          },
          include: {
            projectMembers: { orderBy: { id: 'asc' } },
            tasks: { orderBy: { id: 'asc' } },
          },
        });

        const response = await request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);
        expect(response.text).toBe('');

        const after = await readTaskAssignmentProject(project.id);
        expect(after).toEqual({
          ...project,
          projectMembers: project.projectMembers.filter(
            (entry) => entry.id !== member.id,
          ),
          tasks: project.tasks.map((task) =>
            task.assigneeId === target.id
              ? { ...task, assigneeId: null, updatedAt: expect.any(Date) }
              : task,
          ),
        });
        for (const task of project.tasks.filter(
          (task) => task.assigneeId === target.id,
        )) {
          expect(
            after.tasks
              .find((entry) => entry.id === task.id)!
              .updatedAt.getTime(),
          ).toBeGreaterThan(task.updatedAt.getTime());
        }
        expect(await readTaskAssignmentProject(otherProject.id)).toEqual(
          otherProject,
        );
        expect(
          await prisma.user.findUnique({ where: { id: target.id } }),
        ).toEqual(target);

        const completed = project.tasks.find((task) => task.status === 'done')!;
        const detail = await request(app.getHttpServer())
          .get(`/api/projects/${project.id}/tasks/${completed.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        expect(detail.body).toMatchObject({
          status: 'done',
          assignee: null,
          reporter: { id: target.id, name: null },
        });
      },
    );

    it.each([
      {
        name: 'tokenなし',
        requesterRole: 'owner',
        isArchived: false,
        targetType: 'member',
        status: 401,
        useToken: false,
      },
      {
        name: 'member権限',
        requesterRole: 'member',
        isArchived: false,
        targetType: 'member',
        status: 403,
        useToken: true,
      },
      {
        name: 'viewer権限',
        requesterRole: 'viewer',
        isArchived: false,
        targetType: 'member',
        status: 403,
        useToken: true,
      },
      {
        name: '非参加者',
        requesterRole: null,
        isArchived: false,
        targetType: 'member',
        status: 404,
        useToken: true,
      },
      {
        name: 'アーカイブ済み',
        requesterRole: 'owner',
        isArchived: true,
        targetType: 'member',
        status: 409,
        useToken: true,
      },
      {
        name: 'owner保護',
        requesterRole: 'owner',
        isArchived: false,
        targetType: 'owner',
        status: 409,
        useToken: true,
      },
      {
        name: '対象不在',
        requesterRole: 'owner',
        isArchived: false,
        targetType: 'missing',
        status: 404,
        useToken: true,
      },
    ] as const)(
      '$nameで削除を拒否した場合はTaskの担当と更新日時も変更しない',
      async ({ requesterRole, isArchived, targetType, status, useToken }) => {
        const { prisma, project, member } = await createTaskAssignmentProject({
          requesterRole,
          isArchived,
        });
        const ownerMember = project.projectMembers.find(
          (entry) => entry.role === 'owner',
        )!;
        if (targetType === 'owner') {
          await prisma.task.updateMany({
            where: { projectId: project.id, assigneeId: member.userId },
            data: { assigneeId: project.ownerId },
          });
        }
        const before = await readTaskAssignmentProject(project.id);
        const memberId =
          targetType === 'owner'
            ? ownerMember.id
            : targetType === 'missing'
              ? 'not-found'
              : member.id;
        const deletion = request(app.getHttpServer()).delete(
          `/api/projects/${project.id}/members/${memberId}`,
        );
        if (useToken) deletion.set('Authorization', `Bearer ${accessToken}`);
        await deletion.expect(status);
        expect(await readTaskAssignmentProject(project.id)).toEqual(before);
      },
    );

    it('transaction内の更新・削除後に失敗した場合は担当解除と参加情報削除を両方取り消す', async () => {
      const { prisma, project, member, target } =
        await createTaskAssignmentProject();
      const runTransaction = prisma.$transaction.bind(prisma);
      let changesSeenInsideTransaction = false;
      app.useLogger(false);
      const transactionSpy = vi
        .spyOn(prisma, '$transaction')
        .mockImplementationOnce((operation, options) =>
          runTransaction(async (tx) => {
            await operation(tx);
            const remainingMember = await tx.projectMember.findUnique({
              where: { id: member.id },
            });
            const remainingAssignments = await tx.task.count({
              where: { projectId: project.id, assigneeId: target.id },
            });
            changesSeenInsideTransaction =
              remainingMember === null && remainingAssignments === 0;
            throw new Error('transaction失敗時の取り消しを確認するための例外');
          }, options),
        );

      try {
        await request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(500);
        expect(changesSeenInsideTransaction).toBe(true);
        expect(await readTaskAssignmentProject(project.id)).toEqual(project);
      } finally {
        transactionSpy.mockRestore();
      }
    });

    it('role変更が先にProject行をロックした場合はrole変更200の後に削除204となり、他の参加情報を維持する', async () => {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const remaining = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Member Role Change Before Deletion',
          key: projectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              {
                userId: target.id,
                role: 'member',
                updatedAt: new Date('2020-01-01T00:00:00.000Z'),
              },
              { userId: remaining.id, role: 'viewer' },
            ],
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const member = project.projectMembers.find(
        (entry) => entry.userId === target.id,
      )!;
      let notifyBlockerReady = (_pid: number) => {};
      let rejectBlockerReady = (_error: unknown) => {};
      const blockerReady = new Promise<number>((resolve, reject) => {
        notifyBlockerReady = resolve;
        rejectBlockerReady = reject;
      });
      let resumeMember = () => {};
      const memberGate = new Promise<void>((resolve) => {
        resumeMember = resolve;
      });
      // role変更 API が Project 行を保持して UPDATE を待つよう、対象行をロックする。
      const memberBlocker = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM project_members WHERE id = ${member.id} FOR UPDATE`;
          const [{ pid }] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          notifyBlockerReady(pid);
          await memberGate;
        },
        { timeout: 10000 },
      );
      memberBlocker.catch(rejectBlockerReady);
      let pendingChange: Promise<request.Response> | undefined;
      let pendingDelete: Promise<request.Response> | undefined;

      try {
        const blockerPid = await blockerReady;
        pendingChange = request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role: 'viewer' })
          .expect(200)
          .then((response) => response);
        pendingChange.catch(() => {});

        const changePid = await vi.waitUntil(
          async () => {
            const [changing] = await prisma.$queryRaw<{ pid: number }[]>`
              SELECT pid FROM pg_stat_activity
              WHERE ${blockerPid}::integer = ANY(pg_blocking_pids(pid))
                AND query LIKE 'UPDATE%'
                AND query LIKE '%project_members%'
            `;
            return changing?.pid;
          },
          { timeout: 3000, interval: 10 },
        );

        pendingDelete = request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204)
          .then((response) => response);
        pendingDelete.catch(() => {});

        // 削除 API が先行する role変更の Project 行ロックを待つことを確認する。
        await vi.waitUntil(
          async () => {
            const [state] = await prisma.$queryRaw<{ waiting: boolean }[]>`
              SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity
                WHERE ${changePid}::integer = ANY(pg_blocking_pids(pid))
                  AND query LIKE '%FOR UPDATE%'
                  AND query LIKE '%projects%'
              ) AS waiting
            `;
            return state.waiting;
          },
          { timeout: 3000, interval: 10 },
        );
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);

        resumeMember();
        await memberBlocker;
        const [changed, deleted] = await Promise.all([
          pendingChange,
          pendingDelete,
        ]);
        expect(changed.body).toEqual({
          id: member.id,
          userId: target.id,
          role: 'viewer',
          createdAt: member.createdAt.toISOString(),
          user: { name: null, email: target.email },
        });
        expect(deleted.text).toBe('');
        expect(
          await prisma.projectMember.findUnique({ where: { id: member.id } }),
        ).toBeNull();
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual({
          ...project,
          projectMembers: project.projectMembers.filter(
            (entry) => entry.id !== member.id,
          ),
        });
      } finally {
        resumeMember();
        await Promise.allSettled([memberBlocker, pendingChange, pendingDelete]);
      }
    }, 15000);

    it('削除が先にProject行をロックした場合は削除204の後にrole変更が404となり、残りのDBを維持する', async () => {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const remaining = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Member Deletion Before Role Change',
          key: projectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              { userId: target.id, role: 'member' },
              { userId: remaining.id, role: 'viewer' },
            ],
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const member = project.projectMembers.find(
        (entry) => entry.userId === target.id,
      )!;
      let notifyBlockerReady = (_pid: number) => {};
      let rejectBlockerReady = (_error: unknown) => {};
      const blockerReady = new Promise<number>((resolve, reject) => {
        notifyBlockerReady = resolve;
        rejectBlockerReady = reject;
      });
      let resumeMember = () => {};
      const memberGate = new Promise<void>((resolve) => {
        resumeMember = resolve;
      });
      // 削除 API が Project 行を保持して DELETE を待つよう、対象行をロックする。
      const memberBlocker = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM project_members WHERE id = ${member.id} FOR UPDATE`;
          const [{ pid }] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          notifyBlockerReady(pid);
          await memberGate;
        },
        { timeout: 10000 },
      );
      memberBlocker.catch(rejectBlockerReady);
      let pendingDelete: Promise<request.Response> | undefined;
      let pendingChange: Promise<request.Response> | undefined;

      try {
        const blockerPid = await blockerReady;
        pendingDelete = request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204)
          .then((response) => response);
        pendingDelete.catch(() => {});

        const deletePid = await vi.waitUntil(
          async () => {
            const [deleting] = await prisma.$queryRaw<{ pid: number }[]>`
              SELECT pid FROM pg_stat_activity
              WHERE ${blockerPid}::integer = ANY(pg_blocking_pids(pid))
                AND query LIKE 'DELETE%'
                AND query LIKE '%project_members%'
            `;
            return deleting?.pid;
          },
          { timeout: 3000, interval: 10 },
        );

        pendingChange = request(app.getHttpServer())
          .patch(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ role: 'viewer' })
          .expect(404)
          .then((response) => response);
        pendingChange.catch(() => {});

        // role変更 API も対象の存在を事前確認した後、削除 API の Project 行ロックを待つ。
        await vi.waitUntil(
          async () => {
            const [state] = await prisma.$queryRaw<{ waiting: boolean }[]>`
              SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity
                WHERE ${deletePid}::integer = ANY(pg_blocking_pids(pid))
                  AND query LIKE '%FOR UPDATE%'
                  AND query LIKE '%projects%'
              ) AS waiting
            `;
            return state.waiting;
          },
          { timeout: 3000, interval: 10 },
        );
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);

        resumeMember();
        await memberBlocker;
        const [deleted, changed] = await Promise.all([
          pendingDelete,
          pendingChange,
        ]);
        expect(deleted.text).toBe('');
        expect(changed.body).toEqual({
          message: '変更対象のメンバーが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
        expect(
          await prisma.projectMember.findUnique({ where: { id: member.id } }),
        ).toBeNull();
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual({
          ...project,
          projectMembers: project.projectMembers.filter(
            (entry) => entry.id !== member.id,
          ),
        });
      } finally {
        resumeMember();
        await Promise.allSettled([memberBlocker, pendingDelete, pendingChange]);
      }
    }, 15000);

    it('同じメンバーへの同時削除はProject行ロックの順で204・404となり、Projectと残った参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const remaining = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Concurrent Member Deletions',
          key: projectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              { userId: target.id, role: 'member' },
              { userId: remaining.id, role: 'viewer' },
            ],
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const member = project.projectMembers.find(
        (entry) => entry.userId === target.id,
      )!;
      let notifyBlockerReady = (_pid: number) => {};
      let rejectBlockerReady = (_error: unknown) => {};
      const blockerReady = new Promise<number>((resolve, reject) => {
        notifyBlockerReady = resolve;
        rejectBlockerReady = reject;
      });
      let resumeMember = () => {};
      const memberGate = new Promise<void>((resolve) => {
        resumeMember = resolve;
      });
      // 1件目が Project 行を保持したまま DELETE を待つ状態にする。
      const memberBlocker = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM project_members WHERE id = ${member.id} FOR UPDATE`;
          const [{ pid }] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          notifyBlockerReady(pid);
          await memberGate;
        },
        { timeout: 10000 },
      );
      memberBlocker.catch(rejectBlockerReady);
      let pendingFirst: Promise<request.Response> | undefined;
      let pendingSecond: Promise<request.Response> | undefined;

      try {
        const blockerPid = await blockerReady;
        pendingFirst = request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204)
          .then((response) => response);
        pendingFirst.catch(() => {});

        const firstPid = await vi.waitUntil(
          async () => {
            const [deleting] = await prisma.$queryRaw<{ pid: number }[]>`
              SELECT pid FROM pg_stat_activity
              WHERE ${blockerPid}::integer = ANY(pg_blocking_pids(pid))
                AND query LIKE 'DELETE%'
                AND query LIKE '%project_members%'
            `;
            return deleting?.pid;
          },
          { timeout: 3000, interval: 10 },
        );

        pendingSecond = request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404)
          .then((response) => response);
        pendingSecond.catch(() => {});

        // 2件目も対象の存在を事前確認した後、1件目の Project 行ロックを待つ。
        await vi.waitUntil(
          async () => {
            const [state] = await prisma.$queryRaw<{ waiting: boolean }[]>`
              SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity
                WHERE ${firstPid}::integer = ANY(pg_blocking_pids(pid))
                  AND query LIKE '%FOR UPDATE%'
                  AND query LIKE '%projects%'
              ) AS waiting
            `;
            return state.waiting;
          },
          { timeout: 3000, interval: 10 },
        );
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);

        resumeMember();
        await memberBlocker;
        const [first, second] = await Promise.all([
          pendingFirst,
          pendingSecond,
        ]);
        expect(first.text).toBe('');
        expect(second.body).toEqual({
          message: '削除対象のメンバーが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
        expect(
          await prisma.projectMember.findUnique({ where: { id: member.id } }),
        ).toBeNull();
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual({
          ...project,
          projectMembers: project.projectMembers.filter(
            (entry) => entry.id !== member.id,
          ),
        });
        expect(
          await prisma.user.findUnique({ where: { id: target.id } }),
        ).toEqual(target);
      } finally {
        resumeMember();
        await Promise.allSettled([memberBlocker, pendingFirst, pendingSecond]);
      }
    }, 15000);

    it('事前確認後にアーカイブが完了した場合は削除を409で拒否し、参加情報とアーカイブ後の値・更新日時を維持する', async () => {
      const prisma = app.get(PrismaService);
      const repository = app.get(ProjectsRepository);
      const target = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Archive Before Member Deletion',
          key: projectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              { userId: target.id, role: 'member' },
            ],
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const member = project.projectMembers.find(
        (entry) => entry.userId === target.id,
      )!;

      // Service の事前確認後、実際の削除 transaction に入る直前で待たせる。
      let resumeDelete = () => {};
      const deleteGate = new Promise<void>((resolve) => {
        resumeDelete = resolve;
      });
      const deleteProjectMember =
        repository.deleteProjectMember.bind(repository);
      const deleteSpy = vi
        .spyOn(repository, 'deleteProjectMember')
        .mockImplementationOnce(async (data) => {
          await deleteGate;
          return deleteProjectMember(data);
        });
      const pendingDelete = request(app.getHttpServer())
        .delete(`/api/projects/${project.id}/members/${member.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .then((response) => response);
      pendingDelete.catch(() => {});

      try {
        await vi.waitFor(
          () =>
            expect(deleteSpy).toHaveBeenCalledExactlyOnceWith({
              projectId: project.id,
              projectMemberId: member.id,
            }),
          { timeout: 3000, interval: 10 },
        );

        await request(app.getHttpServer())
          .post(`/api/projects/${project.id}/archive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        const archivedProject = await prisma.project.findUniqueOrThrow({
          where: { id: project.id },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        expect(archivedProject.isArchived).toBe(true);
        expect(archivedProject.projectMembers).toEqual(project.projectMembers);

        resumeDelete();
        const response = await pendingDelete;
        expect(response.status).toBe(409);
        expect(response.body).toEqual({
          message: 'アーカイブ済みのプロジェクトではメンバーを削除できません',
          error: 'Conflict',
          statusCode: 409,
        });
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(archivedProject);
      } finally {
        // 失敗時も待機を解除し、HTTP 処理を終えてから後片付けに進む。
        resumeDelete();
        await Promise.allSettled([pendingDelete]);
        deleteSpy.mockRestore();
      }
    });

    it('削除が先にProject行をロックした場合は完了までアーカイブが待機し、削除204・アーカイブ200で保存できる', async () => {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Member Deletion Before Archive',
          key: projectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              { userId: target.id, role: 'member' },
            ],
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const member = project.projectMembers.find(
        (entry) => entry.userId === target.id,
      )!;
      let notifyBlockerReady = (_pid: number) => {};
      let rejectBlockerReady = (_error: unknown) => {};
      const blockerReady = new Promise<number>((resolve, reject) => {
        notifyBlockerReady = resolve;
        rejectBlockerReady = reject;
      });
      let resumeMember = () => {};
      const memberGate = new Promise<void>((resolve) => {
        resumeMember = resolve;
      });
      // 対象の参加情報をロックし、削除 API が Project 行を保持したまま DELETE を待つ状態にする。
      const memberBlocker = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM project_members WHERE id = ${member.id} FOR UPDATE`;
          const [{ pid }] = await tx.$queryRaw<
            { pid: number }[]
          >`SELECT pg_backend_pid() AS pid`;
          notifyBlockerReady(pid);
          await memberGate;
        },
        { timeout: 10000 },
      );
      memberBlocker.catch(rejectBlockerReady);
      let pendingDelete: Promise<request.Response> | undefined;
      let pendingArchive: Promise<request.Response> | undefined;

      try {
        const blockerPid = await blockerReady;
        pendingDelete = request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204)
          .then((response) => response);
        pendingDelete.catch(() => {});

        const deletionPid = await vi.waitUntil(
          async () => {
            const [deleting] = await prisma.$queryRaw<{ pid: number }[]>`
              SELECT pid FROM pg_stat_activity
              WHERE ${blockerPid}::integer = ANY(pg_blocking_pids(pid))
                AND query LIKE 'DELETE%'
                AND query LIKE '%project_members%'
            `;
            return deleting?.pid;
          },
          { timeout: 3000, interval: 10 },
        );

        pendingArchive = request(app.getHttpServer())
          .post(`/api/projects/${project.id}/archive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
          .then((response) => response);
        pendingArchive.catch(() => {});

        // アーカイブの UPDATE が削除 API の Project 行ロックを待つことを確認する。
        await vi.waitUntil(
          async () => {
            const [state] = await prisma.$queryRaw<{ waiting: boolean }[]>`
              SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity
                WHERE ${deletionPid}::integer = ANY(pg_blocking_pids(pid))
                  AND query LIKE 'UPDATE%'
                  AND query LIKE '%projects%'
              ) AS waiting
            `;
            return state.waiting;
          },
          { timeout: 3000, interval: 10 },
        );
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);

        resumeMember();
        await memberBlocker;
        const [deleted, archived] = await Promise.all([
          pendingDelete,
          pendingArchive,
        ]);
        expect(deleted.text).toBe('');
        expect(archived.body).toMatchObject({
          id: project.id,
          isArchived: true,
        });
        expect(
          await prisma.projectMember.findUnique({ where: { id: member.id } }),
        ).toBeNull();
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual({
          ...project,
          isArchived: true,
          updatedAt: new Date(archived.body.updatedAt),
          projectMembers: project.projectMembers.filter(
            (entry) => entry.id !== member.id,
          ),
        });
      } finally {
        resumeMember();
        await Promise.allSettled([
          memberBlocker,
          pendingDelete,
          pendingArchive,
        ]);
      }
    }, 15000);

    it.each([
      ['token なし', undefined],
      ['Bearer 形式ではないヘッダー', 'Basic'],
      ['無効な token', 'Bearer invalid-token'],
    ])(
      '削除時に%sを401で拒否し、Projectと参加情報を変更しない',
      async (_caseName, authorization) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Unauthorized Member Deletion',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role: 'member' },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const member = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;
        const deletionRequest = request(app.getHttpServer()).delete(
          `/api/projects/${project.id}/members/${member.id}`,
        );
        if (authorization) {
          deletionRequest.set(
            'Authorization',
            authorization === 'Basic' ? `Basic ${accessToken}` : authorization,
          );
        }

        await deletionRequest.expect(401);

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it.each(['member', 'viewer'] as const)(
      'ownerは%sを削除し、204・本文なしと対象だけの削除を確認できる',
      async (role) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();

        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Delete Member',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role },
              ],
            },
          },
          include: {
            projectMembers: { orderBy: { id: 'asc' } },
          },
        });

        const member = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;

        const response = await request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${member.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);

        // 204 は JSON オブジェクトではなく、本文が空であることを確認する。
        expect(response.text).toBe('');

        expect(
          await prisma.projectMember.findUnique({
            where: { id: member.id },
          }),
        ).toBeNull();

        // Project と残った参加情報の値・更新日時を維持する。
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: {
              projectMembers: { orderBy: { id: 'asc' } },
            },
          }),
        ).toEqual({
          ...project,
          projectMembers: project.projectMembers.filter(
            (entry) => entry.id !== member.id,
          ),
        });

        // 削除対象のアプリ側 User を保持する。
        expect(
          await prisma.user.findUnique({
            where: { id: target.id },
          }),
        ).toEqual(target);

        // Supabase Auth のアカウントも保持する。
        const { data, error } = await adminClient.auth.admin.getUserById(
          target.id,
        );

        expect(error).toBeNull();
        expect(data.user?.id).toBe(target.id);
      },
    );

    it('削除後に同じUserを再追加すると新しい参加情報が作られ、古いmemberIdでは削除できない', async () => {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Readd Member After Deletion',
          key: projectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              { userId: target.id, role: 'member' },
            ],
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const originalMember = project.projectMembers.find(
        (entry) => entry.userId === target.id,
      )!;

      const deletion = await request(app.getHttpServer())
        .delete(`/api/projects/${project.id}/members/${originalMember.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      expect(deletion.text).toBe('');

      const readdition = await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/members`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ email: target.email, role: 'viewer' })
        .expect(201);
      const readdedMember = await prisma.projectMember.findUniqueOrThrow({
        where: {
          projectId_userId: { projectId: project.id, userId: target.id },
        },
      });
      expect(readdedMember.id).not.toBe(originalMember.id);
      expect(readdedMember.role).toBe('viewer');
      expect(readdition.body).toEqual({
        id: readdedMember.id,
        userId: target.id,
        role: 'viewer',
        createdAt: readdedMember.createdAt.toISOString(),
        user: { name: null, email: target.email },
      });
      const projectAfterReaddition = await prisma.project.findUniqueOrThrow({
        where: { id: project.id },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      expect(projectAfterReaddition.projectMembers).toHaveLength(2);
      expect(projectAfterReaddition).toEqual({
        ...project,
        projectMembers: expect.arrayContaining([
          project.projectMembers.find((entry) => entry.userId === userId)!,
          readdedMember,
        ]),
      });

      await request(app.getHttpServer())
        .delete(`/api/projects/${project.id}/members/${originalMember.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404)
        .expect({
          message: '削除対象のメンバーが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });

      expect(
        await prisma.projectMember.findUnique({
          where: { id: originalMember.id },
        }),
      ).toBeNull();
      expect(
        await prisma.projectMember.findUnique({
          where: { id: readdedMember.id },
        }),
      ).toEqual(readdedMember);
      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(projectAfterReaddition);
      expect(
        await prisma.user.findUnique({ where: { id: target.id } }),
      ).toEqual(target);
    });

    it.each([
      { role: 'member', isArchived: false, targetExists: false },
      { role: 'viewer', isArchived: false, targetExists: false },
      { role: 'member', isArchived: true, targetExists: false },
      { role: 'viewer', isArchived: true, targetExists: false },
      { role: 'member', isArchived: false, targetExists: true },
      { role: 'viewer', isArchived: false, targetExists: true },
      { role: 'member', isArchived: true, targetExists: true },
      { role: 'viewer', isArchived: true, targetExists: true },
    ] as const)(
      '$roleはisArchived=$isArchived、targetExists=$targetExistsでも403で拒否する',
      async ({ role, isArchived, targetExists }) => {
        const prisma = app.get(PrismaService);
        const owner = await createOtherUser();
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: owner.id,
            name: 'Forbidden Member Deletion',
            key: projectKey,
            isArchived,
            projectMembers: {
              create: [
                { userId: owner.id, role: 'owner' },
                { userId, role },
                ...(targetExists
                  ? [{ userId: target.id, role: 'member' as const }]
                  : []),
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const targetMember = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        );
        const memberId = targetMember?.id ?? 'not-found';

        await request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${memberId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403)
          .expect({
            message: 'プロジェクトのメンバーを削除する権限がありません',
            error: 'Forbidden',
            statusCode: 403,
          });

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it('非参加者による既存Projectと存在しないProjectへの削除は同じ404になり、既存Projectを変更しない', async () => {
      const prisma = app.get(PrismaService);
      const owner = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: owner.id,
          name: 'Unjoined Member Deletion',
          key: projectKey,
          projectMembers: { create: { userId: owner.id, role: 'owner' } },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const ownerMember = project.projectMembers[0];

      for (const projectId of ['not-found', project.id]) {
        await request(app.getHttpServer())
          .delete(`/api/projects/${projectId}/members/${ownerMember.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404)
          .expect({
            message: 'プロジェクトが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });
      }

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(project);
    });

    it('ownerIdが本人でも参加情報がなければ404で拒否し、Projectを変更しない', async () => {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Owner Id Without Membership For Deletion',
          key: projectKey,
          projectMembers: {
            create: { userId: target.id, role: 'member' },
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const targetMember = project.projectMembers[0];

      await request(app.getHttpServer())
        .delete(`/api/projects/${project.id}/members/${targetMember.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404)
        .expect({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(project);
    });

    it.each([
      '存在しないProjectMember.id',
      '対象ユーザーのUser.id',
      '削除済みProjectMember.id',
    ] as const)(
      '%sを削除対象に指定すると同じ404になり、Projectと参加情報を変更しない',
      async (targetType) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Missing Member Deletion Target',
            key: projectKey,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role: 'member' },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const targetMember = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;

        let memberId: string;
        if (targetType === '存在しないProjectMember.id') {
          memberId = randomUUID();
        } else if (targetType === '対象ユーザーのUser.id') {
          memberId = target.id;
        } else {
          memberId = targetMember.id;
          await prisma.projectMember.delete({ where: { id: memberId } });
        }

        const projectBeforeRequest = await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });

        await request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${memberId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404)
          .expect({
            message: '削除対象のメンバーが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(projectBeforeRequest);
      },
    );

    it('別ProjectのProjectMember.idを指定しても同じ404になり、両Projectを変更しない', async () => {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const otherProjectKey = projectKey.replace('E2E', 'OTH');
      projectKeys.push(otherProjectKey);

      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Scoped Member Deletion',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const otherProject = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Foreign Member Deletion',
          key: otherProjectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              { userId: target.id, role: 'member' },
            ],
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const foreignMember = otherProject.projectMembers.find(
        (entry) => entry.userId === target.id,
      )!;

      await request(app.getHttpServer())
        .delete(`/api/projects/${project.id}/members/${foreignMember.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404)
        .expect({
          message: '削除対象のメンバーが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });

      for (const expectedProject of [project, otherProject]) {
        expect(
          await prisma.project.findUnique({
            where: { id: expectedProject.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(expectedProject);
      }
    });

    it('ownerのProjectMemberを削除しようとすると409になり、Projectと参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const target = await createOtherUser();
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Protect Owner Member',
          key: projectKey,
          projectMembers: {
            create: [
              { userId, role: 'owner' },
              { userId: target.id, role: 'member' },
            ],
          },
        },
        include: { projectMembers: { orderBy: { id: 'asc' } } },
      });
      const ownerMember = project.projectMembers.find(
        (entry) => entry.userId === userId,
      )!;

      await request(app.getHttpServer())
        .delete(`/api/projects/${project.id}/members/${ownerMember.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409)
        .expect({
          message: 'owner は削除できません',
          error: 'Conflict',
          statusCode: 409,
        });

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        }),
      ).toEqual(project);
    });

    it.each(['member', 'owner', 'not-found'] as const)(
      'アーカイブ済みProjectでは対象が%sでもアーカイブ競合を優先し、DBを変更しない',
      async (targetType) => {
        const prisma = app.get(PrismaService);
        const target = await createOtherUser();
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Archived Member Deletion',
            key: projectKey,
            isArchived: true,
            projectMembers: {
              create: [
                { userId, role: 'owner' },
                { userId: target.id, role: 'member' },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });
        const ownerMember = project.projectMembers.find(
          (entry) => entry.userId === userId,
        )!;
        const targetMember = project.projectMembers.find(
          (entry) => entry.userId === target.id,
        )!;
        const memberId =
          targetType === 'member'
            ? targetMember.id
            : targetType === 'owner'
              ? ownerMember.id
              : randomUUID();

        await request(app.getHttpServer())
          .delete(`/api/projects/${project.id}/members/${memberId}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(409)
          .expect({
            message: 'アーカイブ済みのプロジェクトではメンバーを削除できません',
            error: 'Conflict',
            statusCode: 409,
          });

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );
  });

  describe('作成: POST /api/projects', () => {
    it.each([
      ['token なし', undefined],
      ['無効な token', 'invalid-token'],
    ])('作成時に%sを401で拒否し、DBに保存しない', async (_caseName, token) => {
      const createRequest = request(app.getHttpServer()).post('/api/projects');
      if (token) {
        createRequest.set('Authorization', `Bearer ${token}`);
      }

      // 本文は正しい値にし、入力エラーではなく認証エラーで拒否されることを確認する。
      await createRequest
        .send({ name: 'Unauthorized Project', key: projectKey })
        .expect(401);

      const prisma = app.get(PrismaService);
      expect(
        await prisma.project.findUnique({ where: { key: projectKey } }),
      ).toBeNull();
      // このテストのユーザーに、参加情報だけが作られていないことも確認する。
      expect(await prisma.projectMember.count({ where: { userId } })).toBe(0);
    });

    it('プロジェクトを作成し、keyを大文字で保存して作成者をownerに登録する', async () => {
      // request は実際のHTTPリクエストと同じ形でAPIを呼び出す。
      const response = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test Project',
          key: projectKey.toLowerCase(),
          description: 'Test Description',
        })
        .expect(201);

      // DBが作るidや日時は毎回変わるため、固定値ではなく型と必要な値を確認する。
      expect(response.body).not.toHaveProperty('lastTaskNumber');
      expect(response.body).toMatchObject({
        id: expect.any(String),
        ownerId: userId,
        name: 'Test Project',
        key: projectKey,
        description: 'Test Description',
        isArchived: false,
      });

      // レスポンスだけでなく、Project と owner の参加情報が DB に保存されたことを確認する。
      const savedProject = await app.get(PrismaService).project.findUnique({
        where: { id: response.body.id },
        include: { projectMembers: true },
      });
      expect(savedProject).toMatchObject({
        ownerId: userId,
        projectMembers: [
          {
            projectId: response.body.id,
            userId,
            role: 'owner',
          },
        ],
      });
    });

    it('作成時にプロジェクト名の前後空白を除いて保存する', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '  正規化された名前  ', key: projectKey })
        .expect(201);

      expect(response.body.name).toBe('正規化された名前');
    });

    it.each([
      ['空白だけの名前', '   '],
      ['trim後に100文字を超える名前', ` ${'a'.repeat(101)} `],
    ])('作成時に%sを400で拒否する', async (_caseName, name) => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name, key: projectKey })
        .expect(400);
    });

    it('リクエスト本文が不正な場合は400を返す', async () => {
      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '', key: 'INVALID-KEY' })
        .expect(400);
    });

    it('プロジェクトkeyがすでに使われている場合は409を返す', async () => {
      const project = {
        name: 'Duplicate Key Project',
        key: projectKey,
      };

      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(project)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/projects')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(project)
        .expect(409)
        .expect({
          message: 'プロジェクトキーは既に使用されています',
          error: 'Conflict',
          statusCode: 409,
        });
    });
  });

  describe('更新: PATCH /api/projects/:projectId', () => {
    it.each([
      ['token なし', undefined],
      ['無効な token', 'invalid-token'],
    ])('更新時に%sを401で拒否し、DBを変更しない', async (_caseName, token) => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Before Update',
          key: projectKey,
          description: '更新前の説明',
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      const updateRequest = request(app.getHttpServer()).patch(
        `/api/projects/${project.id}`,
      );
      if (token) {
        updateRequest.set('Authorization', `Bearer ${token}`);
      }

      // 正しい更新内容でも、認証できなければ保存されない。
      await updateRequest
        .send({ name: 'After Update', description: '更新後の説明' })
        .expect(401);

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual(project);
    });

    it('ownerはプロジェクト名と説明を更新でき、参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Before Update',
          key: projectKey,
          description: '更新前の説明',
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'After Update',
          description: '更新後の説明',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        id: project.id,
        ownerId: userId,
        name: 'After Update',
        key: projectKey,
        description: '更新後の説明',
        isArchived: false,
      });
      expect(response.body).not.toHaveProperty('lastTaskNumber');
      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toMatchObject({
        id: project.id,
        ownerId: userId,
        name: 'After Update',
        key: projectKey,
        description: '更新後の説明',
        isArchived: false,
        createdAt: project.createdAt,
        projectMembers: project.projectMembers,
      });
    });

    it.each(['member', 'viewer'] as const)(
      '%sの更新を403で拒否し、Projectと参加情報を変更しない',
      async (role) => {
        const otherUser = await createOtherUser();
        const prisma = app.get(PrismaService);
        const project = await prisma.project.create({
          data: {
            ownerId: otherUser.id,
            name: 'Before Update',
            key: projectKey,
            description: '更新前の説明',
            projectMembers: {
              create: [
                { userId: otherUser.id, role: 'owner' },
                { userId, role },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });

        // 有効な更新内容でも、本文が空でも、owner 以外は更新できない。
        for (const body of [
          { name: 'After Update', description: '更新後の説明' },
          {},
        ]) {
          await request(app.getHttpServer())
            .patch(`/api/projects/${project.id}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .send(body)
            .expect(403)
            .expect({
              message: 'プロジェクトを更新する権限がありません',
              error: 'Forbidden',
              statusCode: 403,
            });

          // Project と ProjectMember の値・更新日時を、拒否のたびに比較する。
          expect(
            await prisma.project.findUnique({
              where: { id: project.id },
              include: { projectMembers: { orderBy: { id: 'asc' } } },
            }),
          ).toEqual(project);
        }
      },
    );

    it('別Projectのownerでも非参加のProjectは存在しないIDと同じ404で拒否し、Projectと参加情報を変更しない', async () => {
      const otherUser = await createOtherUser();
      const otherProjectKey = projectKey.replace('E2E', 'OTH');
      projectKeys.push(otherProjectKey);

      const prisma = app.get(PrismaService);
      const joinedProject = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Joined Project',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });
      const otherProject = await prisma.project.create({
        data: {
          ownerId: otherUser.id,
          name: 'Other Project',
          key: otherProjectKey,
          description: '更新前の説明',
          projectMembers: { create: { userId: otherUser.id, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      for (const body of [
        { name: 'After Update', description: '更新後の説明' },
        {},
      ]) {
        const notFoundResponse = await request(app.getHttpServer())
          .patch('/api/projects/not-found')
          .set('Authorization', `Bearer ${accessToken}`)
          .send(body)
          .expect(404);
        const response = await request(app.getHttpServer())
          .patch(`/api/projects/${otherProject.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send(body)
          .expect(404);

        expect(response.body).toEqual(notFoundResponse.body);
        expect(response.body).toEqual({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
        for (const project of [joinedProject, otherProject]) {
          expect(
            await prisma.project.findUnique({
              where: { id: project.id },
              include: { projectMembers: true },
            }),
          ).toEqual(project);
        }
      }
    });

    it('ownerIdが本人でも参加情報がなければ404で拒否し、DBを変更しない', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'No Membership',
          key: projectKey,
          description: '更新前の説明',
        },
        include: { projectMembers: true },
      });

      await request(app.getHttpServer())
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'After Update', description: '更新後の説明' })
        .expect(404)
        .expect({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual(project);
    });

    it('ownerはアーカイブ済みProjectの設定も更新できる', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Archived Project',
          key: projectKey,
          isArchived: true,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Archived Project' })
        .expect(200);

      expect(response.body).toMatchObject({
        id: project.id,
        name: 'Updated Archived Project',
        isArchived: true,
      });
      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toMatchObject({
        name: 'Updated Archived Project',
        isArchived: true,
        projectMembers: project.projectMembers,
      });
    });

    it('更新時にプロジェクト名をtrimして保存し、trim後の制約を検証する', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: '更新前',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: '  更新後  ' })
        .expect(200);

      expect(response.body.name).toBe('更新後');

      const updatedProject = await prisma.project.findUnique({
        where: { id: project.id },
        include: { projectMembers: true },
      });
      expect(updatedProject?.name).toBe('更新後');

      for (const name of ['   ', ` ${'a'.repeat(101)} `]) {
        await request(app.getHttpServer())
          .patch(`/api/projects/${project.id}`)
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ name })
          .expect(400);

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: true },
          }),
        ).toEqual(updatedProject);
      }
    });

    it('descriptionをnullにして説明を削除できる', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Project With Description',
          key: projectKey,
          description: '削除する説明',
          projectMembers: { create: { userId, role: 'owner' } },
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: null })
        .expect(200);

      expect(response.body).toMatchObject({
        id: project.id,
        name: 'Project With Description',
        description: null,
      });
      expect(
        await prisma.project.findUnique({ where: { id: project.id } }),
      ).toMatchObject({ description: null });
    });

    it('空文字のdescriptionはnullとして保存する', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Project With Description',
          key: projectKey,
          description: '削除する説明',
          projectMembers: { create: { userId, role: 'owner' } },
        },
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: '' })
        .expect(200);

      expect(response.body.description).toBeNull();
      expect(
        await prisma.project.findUnique({ where: { id: project.id } }),
      ).toMatchObject({ description: null });
    });

    it('更新する項目がない場合は400を返す', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Project For Empty Update',
          key: projectKey,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      await request(app.getHttpServer())
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400)
        .expect({
          message: '更新する項目を指定してください',
          error: 'Bad Request',
          statusCode: 400,
        });

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual(project);
    });

    it('存在しないIDを更新しようとすると404を返す', async () => {
      await request(app.getHttpServer())
        .patch('/api/projects/not-found')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Updated Project' })
        .expect(404)
        .expect({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
    });
  });

  describe('アーカイブ: POST /api/projects/:projectId/archive', () => {
    it.each([
      ['token なし', undefined],
      ['無効な token', 'invalid-token'],
    ])(
      'アーカイブ時に%sを401で拒否し、DBを変更しない',
      async (_caseName, token) => {
        const prisma = app.get(PrismaService);
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Project To Archive',
            key: projectKey,
            isArchived: false,
            projectMembers: { create: { userId, role: 'owner' } },
          },
          include: { projectMembers: true },
        });

        const archiveRequest = request(app.getHttpServer()).post(
          `/api/projects/${project.id}/archive`,
        );
        if (token) {
          archiveRequest.set('Authorization', `Bearer ${token}`);
        }

        await archiveRequest.expect(401);

        // 拒否された場合は、アーカイブ状態や更新日時も変わらない。
        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: true },
          }),
        ).toEqual(project);
      },
    );

    it('ownerはプロジェクトをアーカイブでき、参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Project To Archive',
          key: projectKey,
          isArchived: false,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: project.id,
        ownerId: userId,
        name: 'Project To Archive',
        key: projectKey,
        isArchived: true,
      });
      expect(response.body).not.toHaveProperty('lastTaskNumber');

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual({
        ...project,
        isArchived: true,
        updatedAt: expect.any(Date),
      });
    });

    it.each([
      ['member', false],
      ['viewer', false],
      ['member', true],
      ['viewer', true],
    ] as const)(
      '%sによるアーカイブはisArchived=%sでも403で拒否し、Projectと参加情報を変更しない',
      async (role, isArchived) => {
        const otherUser = await createOtherUser();
        const prisma = app.get(PrismaService);
        const project = await prisma.project.create({
          data: {
            ownerId: otherUser.id,
            name: 'Project For Forbidden Archive',
            key: projectKey,
            description: 'アーカイブ前の説明',
            isArchived,
            projectMembers: {
              create: [
                { userId: otherUser.id, role: 'owner' },
                { userId, role },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });

        // アーカイブ済みでも、owner 以外に成功を返さない。
        await request(app.getHttpServer())
          .post(`/api/projects/${project.id}/archive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403)
          .expect({
            message: 'プロジェクトをアーカイブする権限がありません',
            error: 'Forbidden',
            statusCode: 403,
          });

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it.each([false, true])(
      'isArchived=%sでも別Projectのownerによる非参加Projectのアーカイブは存在しないIDと同じ404で拒否し、DBを変更しない',
      async (isArchived) => {
        const otherUser = await createOtherUser();
        const otherProjectKey = projectKey.replace('E2E', 'OTH');
        projectKeys.push(otherProjectKey);

        const prisma = app.get(PrismaService);
        const joinedProject = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Joined Project',
            key: projectKey,
            projectMembers: { create: { userId, role: 'owner' } },
          },
          include: { projectMembers: true },
        });
        const otherProject = await prisma.project.create({
          data: {
            ownerId: otherUser.id,
            name: 'Other Project To Archive',
            key: otherProjectKey,
            description: 'アーカイブ前の説明',
            isArchived,
            projectMembers: { create: { userId: otherUser.id, role: 'owner' } },
          },
          include: { projectMembers: true },
        });

        const notFoundResponse = await request(app.getHttpServer())
          .post('/api/projects/not-found/archive')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
        const response = await request(app.getHttpServer())
          .post(`/api/projects/${otherProject.id}/archive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        expect(response.body).toEqual(notFoundResponse.body);
        expect(response.body).toEqual({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
        // 操作対象と本人の参加先のどちらも、値・更新日時が変わらない。
        for (const project of [joinedProject, otherProject]) {
          expect(
            await prisma.project.findUnique({
              where: { id: project.id },
              include: { projectMembers: true },
            }),
          ).toEqual(project);
        }
      },
    );

    it.each([false, true])(
      'isArchived=%sでownerIdが本人でも参加情報がなければアーカイブを404で拒否し、DBを変更しない',
      async (isArchived) => {
        const prisma = app.get(PrismaService);
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'No Membership To Archive',
            key: projectKey,
            isArchived,
          },
          include: { projectMembers: true },
        });

        await request(app.getHttpServer())
          .post(`/api/projects/${project.id}/archive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404)
          .expect({
            message: 'プロジェクトが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: true },
          }),
        ).toEqual(project);
      },
    );

    it('存在しないIDをアーカイブしようとすると404を返す', async () => {
      await request(app.getHttpServer())
        .post('/api/projects/not-found/archive')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404)
        .expect({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
    });

    it('ownerはアーカイブ済みのプロジェクトを再度アーカイブしても成功する', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Already Archived Project',
          key: projectKey,
          isArchived: true,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/archive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: project.id,
        isArchived: true,
      });
      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual({ ...project, updatedAt: expect.any(Date) });
    });
  });

  describe('アーカイブ解除: POST /api/projects/:projectId/unarchive', () => {
    it.each([
      ['token なし', undefined],
      ['無効な token', 'invalid-token'],
    ])(
      'アーカイブ解除時に%sを401で拒否し、DBを変更しない',
      async (_caseName, token) => {
        const prisma = app.get(PrismaService);
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Project To Unarchive',
            key: projectKey,
            isArchived: true,
            projectMembers: { create: { userId, role: 'owner' } },
          },
          include: { projectMembers: true },
        });

        const unarchiveRequest = request(app.getHttpServer()).post(
          `/api/projects/${project.id}/unarchive`,
        );
        if (token) {
          unarchiveRequest.set('Authorization', `Bearer ${token}`);
        }

        await unarchiveRequest.expect(401);

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: true },
          }),
        ).toEqual(project);
      },
    );

    it('ownerはアーカイブ済みのプロジェクトを解除でき、参加情報を変更しない', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Project To Unarchive',
          key: projectKey,
          isArchived: true,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/unarchive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: project.id,
        ownerId: userId,
        name: 'Project To Unarchive',
        key: projectKey,
        isArchived: false,
      });
      expect(response.body).not.toHaveProperty('lastTaskNumber');

      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual({
        ...project,
        isArchived: false,
        updatedAt: expect.any(Date),
      });
    });

    it.each([
      ['member', true],
      ['viewer', true],
      ['member', false],
      ['viewer', false],
    ] as const)(
      '%sによるアーカイブ解除はisArchived=%sでも403で拒否し、Projectと参加情報を変更しない',
      async (role, isArchived) => {
        const otherUser = await createOtherUser();
        const prisma = app.get(PrismaService);
        const project = await prisma.project.create({
          data: {
            ownerId: otherUser.id,
            name: 'Project For Forbidden Unarchive',
            key: projectKey,
            description: '解除前の説明',
            isArchived,
            projectMembers: {
              create: [
                { userId: otherUser.id, role: 'owner' },
                { userId, role },
              ],
            },
          },
          include: { projectMembers: { orderBy: { id: 'asc' } } },
        });

        // 解除済みでも、owner 以外に成功を返さない。
        await request(app.getHttpServer())
          .post(`/api/projects/${project.id}/unarchive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403)
          .expect({
            message: 'プロジェクトのアーカイブを解除する権限がありません',
            error: 'Forbidden',
            statusCode: 403,
          });

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: { orderBy: { id: 'asc' } } },
          }),
        ).toEqual(project);
      },
    );

    it.each([true, false])(
      'isArchived=%sでも別Projectのownerによる非参加Projectのアーカイブ解除は存在しないIDと同じ404で拒否し、DBを変更しない',
      async (isArchived) => {
        const otherUser = await createOtherUser();
        const otherProjectKey = projectKey.replace('E2E', 'OTH');
        projectKeys.push(otherProjectKey);

        const prisma = app.get(PrismaService);
        const joinedProject = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'Joined Project',
            key: projectKey,
            projectMembers: { create: { userId, role: 'owner' } },
          },
          include: { projectMembers: true },
        });
        const otherProject = await prisma.project.create({
          data: {
            ownerId: otherUser.id,
            name: 'Other Project To Unarchive',
            key: otherProjectKey,
            description: '解除前の説明',
            isArchived,
            projectMembers: { create: { userId: otherUser.id, role: 'owner' } },
          },
          include: { projectMembers: true },
        });

        const notFoundResponse = await request(app.getHttpServer())
          .post('/api/projects/not-found/unarchive')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);
        const response = await request(app.getHttpServer())
          .post(`/api/projects/${otherProject.id}/unarchive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404);

        expect(response.body).toEqual(notFoundResponse.body);
        expect(response.body).toEqual({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
        for (const project of [joinedProject, otherProject]) {
          expect(
            await prisma.project.findUnique({
              where: { id: project.id },
              include: { projectMembers: true },
            }),
          ).toEqual(project);
        }
      },
    );

    it.each([true, false])(
      'isArchived=%sでownerIdが本人でも参加情報がなければアーカイブ解除を404で拒否し、DBを変更しない',
      async (isArchived) => {
        const prisma = app.get(PrismaService);
        const project = await prisma.project.create({
          data: {
            ownerId: userId,
            name: 'No Membership To Unarchive',
            key: projectKey,
            isArchived,
          },
          include: { projectMembers: true },
        });

        await request(app.getHttpServer())
          .post(`/api/projects/${project.id}/unarchive`)
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(404)
          .expect({
            message: 'プロジェクトが見つかりません',
            error: 'Not Found',
            statusCode: 404,
          });

        expect(
          await prisma.project.findUnique({
            where: { id: project.id },
            include: { projectMembers: true },
          }),
        ).toEqual(project);
      },
    );

    it('ownerは解除済みのプロジェクトを再度解除しても成功する', async () => {
      const prisma = app.get(PrismaService);
      const project = await prisma.project.create({
        data: {
          ownerId: userId,
          name: 'Already Unarchived Project',
          key: projectKey,
          isArchived: false,
          projectMembers: { create: { userId, role: 'owner' } },
        },
        include: { projectMembers: true },
      });

      const response = await request(app.getHttpServer())
        .post(`/api/projects/${project.id}/unarchive`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: project.id,
        isArchived: false,
      });
      expect(
        await prisma.project.findUnique({
          where: { id: project.id },
          include: { projectMembers: true },
        }),
      ).toEqual({ ...project, updatedAt: expect.any(Date) });
    });

    it('存在しないIDのアーカイブを解除しようとすると404を返す', async () => {
      await request(app.getHttpServer())
        .post('/api/projects/not-found/unarchive')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404)
        .expect({
          message: 'プロジェクトが見つかりません',
          error: 'Not Found',
          statusCode: 404,
        });
    });
  });
});
