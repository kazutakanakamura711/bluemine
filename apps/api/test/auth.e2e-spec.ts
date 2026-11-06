import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { PrismaService } from '../src/modules/prisma/prisma.service.js';

type AuthTestUser = {
  id: string;
  email: string;
  accessToken: string;
  adminClient: SupabaseClient;
  prisma: PrismaService;
};

describe('Auth endpoint', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('token がない場合は 401 を返す', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('Bearer 形式でも無効な token は 401 を返す', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not-a-valid-jwt')
      .expect(401);
  });

  // ケースごとに一時ユーザーを用意し、途中で失敗しても今回のデータだけを片付ける。
  async function withTestUser(
    userMetadata: Record<string, unknown>,
    verify: (user: AuthTestUser) => Promise<void>,
  ) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !secretKey || !publishableKey) {
      throw new Error(
        'テスト用の Supabase URL、Secret key、Publishable key が必要です。',
      );
    }

    // 管理 API でユーザーを作成・削除するため、接続先をローカルだけに限定する。
    const url = new URL(supabaseUrl);
    if (
      url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    ) {
      throw new Error('Auth E2E はローカルの Supabase で実行してください。');
    }

    // Secret key を使うSupabaseの管理用クライアント。ログイン状態は保存しない。
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // Publishable key を使うログイン用クライアント。ユーザーのメールとパスワードで認証する。
    const loginClient = createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    // 実行ごとに違うメールとパスワードを作り、既存ユーザーとの重複を避ける。
    const email = `e2e-${randomUUID()}@example.test`;
    const password = `E2e!${randomBytes(24).toString('hex')}`;
    let authUserId: string | undefined;
    // setup-env.ts で接続先を E2E 専用 DB に切り替えた PrismaService を使う。
    const prisma = app.get(PrismaService);

    try {
      // Supabase にユーザー作成を依頼する。
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // 確認メールを開く操作を省き、確認済みとして作成する。
        user_metadata: userMetadata,
      });
      // 検証で失敗しても削除できるよう、作成したユーザーの ID を先に記録する。
      authUserId = data.user?.id;
      if (error) {
        throw error;
      }
      if (!data.user) {
        throw new Error('テスト用の Auth ユーザーを取得できませんでした。');
      }

      expect(data.user?.id).toEqual(expect.any(String));
      expect(data.user?.email).toBe(email);
      expect(data.user?.email_confirmed_at).toBeTruthy();

      // 作成時と同じメール・パスワードで Supabase Auth にログインする。
      const { data: signInData, error: signInError } =
        await loginClient.auth.signInWithPassword({ email, password });
      if (signInError) {
        throw signInError;
      }

      // ログインした本人が、今回作成したユーザーであることを確認する。
      expect(signInData.user?.id).toBe(authUserId);
      expect(signInData.user?.email).toBe(email);

      // ログイン成功時の session から、次に NestJS API へ渡す access token を取り出す。
      const accessToken = signInData.session?.access_token;
      expect(accessToken).toEqual(expect.any(String));
      expect(accessToken).toBeTruthy();
      if (!accessToken) {
        throw new Error('テスト用の access token を取得できませんでした。');
      }

      await verify({
        id: data.user.id,
        email,
        accessToken,
        adminClient,
        prisma,
      });
    } finally {
      // 今回の API 呼び出しで作られたアプリ側の User と Auth ユーザーだけを削除する。
      if (authUserId) {
        try {
          // API 呼び出し前に失敗して User が未作成でも、deleteMany なら実行できる。
          await prisma.user.deleteMany({ where: { id: authUserId } });
        } finally {
          // アプリ側の削除が失敗した場合も、Auth ユーザーの削除を試みる。
          const { error } = await adminClient.auth.admin.deleteUser(authUserId);
          expect(error, 'テストユーザーの削除に失敗しました。').toBeNull();
        }
      }
    }
  }

  it('有効な token を送ると本人の User と名前を返し、DB に保存する', async () => {
    await withTestUser(
      { name: '山田 太郎' },
      async ({ id, email, accessToken, prisma }) => {
        // 実際の Service の処理を使いながら、検証回数を記録する。
        const getMeSpy = vi.spyOn(app.get(AuthService), 'getMe');
        const response = await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body).toMatchObject({ id, email, name: '山田 太郎' });
        expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({
          id,
          email,
          name: '山田 太郎',
        });
        // Guard で検証した後、Controller では同じ検証を繰り返さない。
        expect(getMeSpy).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('初回に本人取得とProject一覧を並行取得しても、同じUserを保存して成功する', async () => {
    await withTestUser(
      { name: '並行登録ユーザー' },
      async ({ id, email, accessToken, prisma }) => {
        expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
        // HTTP応答をすべて待ってから検証し、失敗時にも通信完了後に片付ける。
        const responses = await Promise.all(
          Array.from({ length: 8 }, (_, index) =>
            request(app.getHttpServer())
              .get(index % 2 === 0 ? '/api/auth/me' : '/api/projects')
              .set('Authorization', `Bearer ${accessToken}`),
          ),
        );
        for (const [index, response] of responses.entries()) {
          expect(response.status).toBe(200);
          if (index % 2 === 0) {
            expect(response.body).toMatchObject({
              id,
              email,
              name: '並行登録ユーザー',
            });
          } else {
            expect(response.body).toEqual([]);
          }
        }
        expect(await prisma.user.findMany({ where: { email } })).toEqual([
          expect.objectContaining({ id, email, name: '並行登録ユーザー' }),
        ]);
      },
    );
  });

  it('別IDのUserが同じメールを持つ場合は、そのUserを上書きしない', async () => {
    await withTestUser(
      { name: '新しい認証ユーザー' },
      async ({ id, email, accessToken, prisma }) => {
        const otherId = randomUUID();
        const existingUser = await prisma.user.create({
          data: { id: otherId, email, name: '既存の別ユーザー' },
        });
        try {
          await request(app.getHttpServer())
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(500);
          expect(
            await prisma.user.findUnique({ where: { id: otherId } }),
          ).toEqual(existingUser);
          expect(await prisma.user.findUnique({ where: { id } })).toBeNull();
        } finally {
          await prisma.user.deleteMany({ where: { id: otherId } });
        }
      },
    );
  });

  it('名前の前後の空白を除いて返し、DB に保存する', async () => {
    await withTestUser(
      { name: ' \t山田 太郎\u3000\n' },
      async ({ id, accessToken, prisma }) => {
        const response = await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.name).toBe('山田 太郎');
        expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({
          name: '山田 太郎',
        });
      },
    );
  });

  it('Supabase の名前が変わると、同じ User の名前も更新する', async () => {
    await withTestUser(
      { name: '更新前の名前' },
      async ({ id, email, accessToken, adminClient, prisma }) => {
        const initialResponse = await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        expect(initialResponse.body.name).toBe('更新前の名前');

        const { error } = await adminClient.auth.admin.updateUserById(id, {
          user_metadata: { name: ' \t更新後の名前\u3000' },
        });
        expect(error).toBeNull();

        // 同じ token でも、getUser() が Supabase の現在の名前を取得する。
        const response = await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body).toMatchObject({
          id,
          email,
          name: '更新後の名前',
        });
        expect(response.body.createdAt).toBe(initialResponse.body.createdAt);
        expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({
          id,
          email,
          name: '更新後の名前',
        });
      },
    );
  });

  it.each([
    { caseName: '未設定', metadata: {} },
    { caseName: '空文字', metadata: { name: '' } },
    { caseName: '空白のみ', metadata: { name: ' \t\u3000\n' } },
    { caseName: 'null', metadata: { name: null } },
    { caseName: '数値', metadata: { name: 123 } },
    { caseName: 'オブジェクト', metadata: { name: { value: '山田 太郎' } } },
  ])(
    '名前が $caseName の場合は null を返し、DB に保存する',
    async ({ metadata }) => {
      await withTestUser(metadata, async ({ id, accessToken, prisma }) => {
        const response = await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.name).toBeNull();
        expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({
          name: null,
        });
      });
    },
  );

  it('Supabase の名前が空白に変わると、既存 User の名前も null に更新する', async () => {
    await withTestUser(
      { name: '更新前の名前' },
      async ({ id, accessToken, adminClient, prisma }) => {
        const initialResponse = await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
        expect(initialResponse.body.name).toBe('更新前の名前');

        const { error } = await adminClient.auth.admin.updateUserById(id, {
          user_metadata: { name: ' \t\u3000' },
        });
        expect(error).toBeNull();

        const response = await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.id).toBe(id);
        expect(response.body.name).toBeNull();
        expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({
          name: null,
        });
      },
    );
  });
});
