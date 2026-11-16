import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';

import { validateBrowserE2EEnvironment } from '../environment.mjs';
import { expect, test } from '../fixtures/test-user.js';

type Message = { ID: string; Subject: string; To: { Address: string }[] };

// メールの読み取り・削除は、今回用意した一意のテスト宛先に限定する。
async function messages(email: string): Promise<Message[]> {
  const environment = validateBrowserE2EEnvironment();
  if (!/^browser-e2e-[0-9a-f-]{36}@example\.test$/.test(email)) {
    throw new Error('専用テストのメールアドレスではありません。');
  }
  const url = new URL('/api/v1/search', environment.mailUrl);
  url.searchParams.set('query', `to:${email}`);
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('専用メールを取得できませんでした。');
  const data = (await response.json()) as { messages: Message[] };
  return data.messages.filter(
    (message) => message.To.length === 1 && message.To[0].Address === email,
  );
}

async function deleteMessages(email: string) {
  const environment = validateBrowserE2EEnvironment();
  const ids = [
    ...new Set((await messages(email)).map((message) => message.ID)),
  ];
  if (!ids.length) return;
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
  if (!response.ok) throw new Error('専用メールを削除できませんでした。');
}

async function recoveryUrl(email: string) {
  const environment = validateBrowserE2EEnvironment();
  let message: Message | undefined;
  await expect
    .poll(
      async () => {
        message = (await messages(email)).find(
          (item) => item.Subject === 'パスワードの再設定',
        );
        return Boolean(message);
      },
      { message: '再設定メールが届きませんでした。', timeout: 10000 },
    )
    .toBe(true);
  if (!message) throw new Error('再設定メールがありません。');
  const response = await fetch(
    new URL(
      `/api/v1/message/${encodeURIComponent(message.ID)}`,
      environment.mailUrl,
    ),
    { redirect: 'error', signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error('メール本文を取得できませんでした。');
  const { HTML } = (await response.json()) as { HTML: string };
  const href = /<a\b[^>]*\bhref="([^"]+)"/i.exec(HTML)?.[1];
  const url = new URL(href?.replaceAll('&amp;', '&') ?? '');
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (
    url.origin !== environment.webUrl ||
    url.pathname !== '/reset-password' ||
    url.search ||
    url.username ||
    url.password ||
    fragment.get('type') !== 'recovery' ||
    !fragment.get('token_hash')
  ) {
    throw new Error('リンクは専用Webの再設定画面に限定します。');
  }
  return url.href;
}

async function requestRecovery(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('link', { name: 'パスワードをお忘れの方' }).click();
  // Client Component の読み込み完了後に操作する。
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/メールアドレス/).fill(email);
  await page.getByRole('button', { name: '再設定メールを送信' }).click();
  await expect(page.getByRole('status')).toContainText('アカウントがある場合');
}

async function fillPassword(page: Page, password: string) {
  await page.getByLabel(/^新しいパスワード\s*\*?$/).fill(password);
  await page.getByLabel(/^新しいパスワード（確認）\s*\*?$/).fill(password);
  await page.getByRole('button', { name: 'パスワードを再設定' }).click();
}

test('再設定メールからパスワードを更新し、手動でログインできる', async ({
  page,
  testUser,
}) => {
  try {
    await requestRecovery(page, testUser.email);
    const link = await recoveryUrl(testUser.email);
    await page.goto(link);
    const newPassword = `${testUser.password}New`;
    await fillPassword(page, newPassword);
    await expect(page.getByRole('status')).toContainText(
      '再設定が完了しました',
    );
    await page.goto('/projects');
    await expect(page).toHaveURL('http://localhost:3100/login');

    // 使用済みメールは再利用できない。
    await page.goto(link);
    await fillPassword(page, newPassword);
    await expect(page.getByRole('form').getByRole('alert')).toContainText(
      '無効か、期限切れ・使用済み',
    );

    await page.goto('/login');
    await page.getByLabel(/^メールアドレス\s*\*?$/).fill(testUser.email);
    await page.getByLabel(/^パスワード\s*\*?$/).fill(testUser.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(
      page.getByRole('form', { name: 'ログインフォーム' }).getByRole('alert'),
    ).toContainText('メールアドレスまたはパスワードが正しくありません');
    await page.getByLabel(/^パスワード\s*\*?$/).fill(newPassword);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(page).toHaveURL('http://localhost:3100/projects');
    await expect(
      page.getByRole('button', { name: 'ユーザーメニュー' }),
    ).toContainText(testUser.email);
  } finally {
    await deleteMessages(testUser.email);
  }
});

test('存在しないメールも同じ案内を表示する', async ({ page }) => {
  const email = `browser-e2e-${randomUUID()}@example.test`;
  try {
    await requestRecovery(page, email);
  } finally {
    await deleteMessages(email);
  }
});

test('期限切れの再設定メールは拒否される', async ({ page, testUser }) => {
  try {
    await requestRecovery(page, testUser.email);
    const link = await recoveryUrl(testUser.email);
    if (!/^[0-9a-f-]{36}$/.test(testUser.id))
      throw new Error('テストユーザーIDが不正です。');
    // 待ち時間を置かず、専用Authの今回のユーザーだけ有効期限を過去にする。
    execFileSync(
      'docker',
      [
        'exec',
        'supabase_db_bluemine-browser-e2e',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `UPDATE auth.users SET recovery_sent_at = now() - interval '2 hours' WHERE id = '${testUser.id}'`,
      ],
      { stdio: 'ignore' },
    );
    await page.goto(link);
    await fillPassword(page, `${testUser.password}New`);
    await expect(page.getByRole('form').getByRole('alert')).toContainText(
      '無効か、期限切れ・使用済み',
    );
  } finally {
    await deleteMessages(testUser.email);
  }
});
