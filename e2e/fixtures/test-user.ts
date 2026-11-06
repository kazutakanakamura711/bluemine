import { randomBytes, randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import {
  getBrowserE2EAdminCredentials,
  validateBrowserE2EEnvironment,
} from '../environment.mjs';

type TestUser = {
  id: string;
  email: string;
  password: string;
  name: string;
};

export const test = base.extend<{ testUser: TestUser }>({
  testUser: async ({ context }, use) => {
    const environment = validateBrowserE2EEnvironment();
    const { supabaseUrl, secretKey } = getBrowserE2EAdminCredentials();
    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
    });

    const email = `browser-e2e-${randomUUID()}@example.test`;
    const password = `E2e!${randomBytes(24).toString('hex')}`;
    const name = 'ブラウザE2Eユーザー';
    let authUserId: string | undefined;

    try {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        // メール確認の導線は別のテストで扱う。
        email_confirm: true,
        user_metadata: { name },
      });
      // 作成直後の検証で失敗しても、今回のユーザーを削除できるようにする。
      authUserId = data.user?.id;
      if (error) throw error;
      if (!data.user) {
        throw new Error('ブラウザE2E用のAuthユーザーを取得できませんでした。');
      }
      expect(data.user.email).toBe(email);
      expect(data.user.email_confirmed_at).toBeTruthy();

      // このfixtureを要求したテストだけに、一時ユーザーを渡す。
      await use({ id: data.user.id, email, password, name });
    } finally {
      try {
        // Cookieと実行中の通信を片付けてから、DBのユーザーを削除する。
        await context.close();
      } finally {
        try {
          if (authUserId) {
            try {
              // 参照元から順に、今回のユーザーと作成したProjectだけを片付ける。
              // 作成途中で失敗し、該当データがなくてもdeleteManyなら実行できる。
              await prisma.$transaction([
                prisma.projectMember.deleteMany({
                  where: {
                    OR: [
                      { userId: authUserId },
                      { project: { ownerId: authUserId } },
                    ],
                  },
                }),
                prisma.project.deleteMany({ where: { ownerId: authUserId } }),
                prisma.user.deleteMany({ where: { id: authUserId } }),
              ]);
            } finally {
              // アプリ側の削除が失敗した場合も、Auth側の削除を試みる。
              const { error } =
                await adminClient.auth.admin.deleteUser(authUserId);
              expect(
                error,
                'ブラウザE2E用のAuthユーザーの削除に失敗しました。',
              ).toBeNull();
            }
          }
        } finally {
          await prisma.$disconnect();
        }
      }
    }
  },
});

export { expect };
