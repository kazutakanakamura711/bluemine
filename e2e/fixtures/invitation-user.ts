import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import {
  getBrowserE2EAdminCredentials,
  validateBrowserE2EEnvironment,
} from '../environment.mjs';
import { expect, test as base } from './test-user.js';

type InvitationUser = {
  id: string;
  email: string;
  password: string;
  name: string;
  url: string;
  isConfirmed: () => Promise<boolean>;
};

// 専用 Supabase の招待情報を使い、テストごとに新しいユーザーを用意する。
export const test = base.extend<{ invitationUser: InvitationUser }>({
  invitationUser: async ({ context }, use) => {
    const environment = validateBrowserE2EEnvironment();
    const { supabaseUrl, secretKey } = getBrowserE2EAdminCredentials();
    const admin = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
    });
    const email = `browser-e2e-invitation-${randomUUID()}@example.test`;
    let userId: string | undefined;

    try {
      // メールは送信せず、専用 Auth に招待ユーザーと検証用 token を作る。
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'invite',
        email,
      });
      userId = data.user?.id;
      if (error) throw error;
      if (!userId || !data.properties?.hashed_token) {
        throw new Error('テスト用の招待情報を取得できませんでした。');
      }
      expect(data.user.email).toBe(email);
      expect(data.user.email_confirmed_at).toBeFalsy();
      expect(data.properties.verification_type).toBe('invite');

      // メールテンプレートは未実装なので、画面が受け付ける URL を組み立てる。
      const url = new URL('/invitation', environment.webUrl);
      url.hash = new URLSearchParams({
        token_hash: data.properties.hashed_token,
        type: 'invite',
      }).toString();

      await use({
        id: userId,
        email,
        password: `E2e!${randomBytes(24).toString('hex')}`,
        name: '招待E2Eユーザー',
        url: url.href,
        isConfirmed: async () => {
          const result = await admin.auth.admin.getUserById(userId!);
          if (result.error) throw result.error;
          return Boolean(result.data.user?.email_confirmed_at);
        },
      });
    } finally {
      try {
        await context.close();
      } finally {
        try {
          // 作成処理の応答が失われても、今回の一意のメールに一致するユーザーだけを探す。
          if (!userId) {
            for (let page = 1; ; page += 1) {
              const result = await admin.auth.admin.listUsers({
                page,
                perPage: 100,
              });
              if (result.error) throw result.error;
              const match = result.data.users.find(
                (user) => user.email === email,
              );
              if (match) {
                userId = match.id;
                break;
              }
              if (result.data.users.length < 100) break;
            }
          }
          if (userId) {
            try {
              // 招待側ユーザーは Project を作成しない。
              await prisma.user.deleteMany({ where: { id: userId } });
            } finally {
              const { error } = await admin.auth.admin.deleteUser(userId);
              expect(
                error,
                '招待テスト用 Auth ユーザーの削除に失敗しました。',
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
