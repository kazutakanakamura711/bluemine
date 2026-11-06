import { randomBytes, randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import {
  getBrowserE2EAdminCredentials,
  validateBrowserE2EEnvironment,
} from '../environment.mjs';

type RegistrationUser = {
  email: string;
  password: string;
  name: string;
};

type MailMessage = {
  ID: string;
  Subject: string;
  To: { Address: string }[];
};

// Mailpitの検索に加え、返ってきた宛先も完全一致で確認する。
async function getRegistrationMessages(email: string): Promise<MailMessage[]> {
  const environment = validateBrowserE2EEnvironment();
  if (!/^browser-e2e-registration-[0-9a-f-]{36}@example\.test$/.test(email)) {
    throw new Error(
      'メールの操作対象は今回の登録テスト用アドレスに限定します。',
    );
  }

  const url = new URL('/api/v1/search', environment.mailUrl);
  url.searchParams.set('query', `to:${email}`);
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error('専用Mailpitからメール一覧を取得できませんでした。');
  }
  const data = (await response.json()) as { messages: MailMessage[] };
  return data.messages.filter(
    (message) => message.To.length === 1 && message.To[0].Address === email,
  );
}

export async function waitForConfirmationUrl(email: string): Promise<string> {
  const environment = validateBrowserE2EEnvironment();
  let message: MailMessage | undefined;

  // SMTPの配送完了を待つ。メール本文や確認tokenをpollの比較値に含めない。
  await expect
    .poll(
      async () => {
        const messages = await getRegistrationMessages(email);
        message = messages.find(
          (item) => item.Subject === 'メールアドレスの確認',
        );
        return Boolean(message);
      },
      {
        message: '登録確認メールが専用Mailpitに届きませんでした。',
        timeout: 10000,
      },
    )
    .toBe(true);

  if (!message) {
    throw new Error('登録確認メールを取得できませんでした。');
  }
  const response = await fetch(
    new URL(
      `/api/v1/message/${encodeURIComponent(message.ID)}`,
      environment.mailUrl,
    ),
    { redirect: 'error', signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) {
    throw new Error('登録確認メールの本文を取得できませんでした。');
  }
  const { HTML } = (await response.json()) as { HTML: string };
  // 専用テンプレートの唯一のリンクを読む。HTMLをブラウザへ挿入しない。
  const href = /<a\b[^>]*\bhref="([^"]+)"/i.exec(HTML)?.[1];
  let url: URL;
  try {
    url = new URL(href?.replaceAll('&amp;', '&') ?? '');
  } catch {
    throw new Error('確認メールに有効なリンクがありません。');
  }
  if (
    url.origin !== environment.webUrl ||
    url.pathname !== '/confirm' ||
    url.searchParams.get('type') !== 'email' ||
    !url.searchParams.get('token_hash') ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error('確認リンクは専用Webの /confirm に限定しています。');
  }
  return url.href;
}

async function deleteRegistrationMessages(email: string) {
  const environment = validateBrowserE2EEnvironment();
  const messages = await getRegistrationMessages(email);
  const ids = [...new Set(messages.map((message) => message.ID))];
  // IDsを省略すると全件削除になるため、対象がある場合だけ送信する。
  if (ids.length === 0) return;

  const response = await fetch(
    new URL('/api/v1/messages', environment.mailUrl),
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ IDs: ids }),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) {
    throw new Error('登録テスト用メールの削除に失敗しました。');
  }
}

async function findRegistrationUser(
  adminClient: SupabaseClient,
  email: string,
) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    const user = data.users.find((item) => item.email === email);
    if (user) return user;
    if (data.users.length < 100) return null;
  }
}

export const test = base.extend<{ registrationUser: RegistrationUser }>({
  registrationUser: async ({ context }, use) => {
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
    const email = `browser-e2e-registration-${randomUUID()}@example.test`;

    try {
      // 入力値だけを用意する。Authユーザーはブラウザの登録フォームが作成する。
      await use({
        email,
        password: `E2e!${randomBytes(24).toString('hex')}`,
        name: 'メール確認E2Eユーザー',
      });
    } finally {
      try {
        await context.close();
      } finally {
        try {
          // 未確認のまま失敗した場合も、今回のメールに一致するAuthユーザーを探す。
          const user = await findRegistrationUser(adminClient, email);
          if (user) {
            try {
              // このテストではProjectを作成しない。未確認ならアプリ側Userは0件。
              await prisma.user.deleteMany({ where: { id: user.id } });
            } finally {
              const { error } = await adminClient.auth.admin.deleteUser(
                user.id,
              );
              expect(
                error,
                '登録テスト用のAuthユーザーの削除に失敗しました。',
              ).toBeNull();
            }
          }
        } finally {
          try {
            // DB/Auth側で失敗した場合も、今回の宛先のメールだけを片付ける。
            await deleteRegistrationMessages(email);
          } finally {
            await prisma.$disconnect();
          }
        }
      }
    }
  },
});

export { expect };
