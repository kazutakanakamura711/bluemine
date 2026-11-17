import type { BrowserContext, Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import {
  getBrowserE2EAdminCredentials,
  validateBrowserE2EEnvironment,
} from '../environment.mjs';
import { expect, test } from '../fixtures/invitation-user.js';

function adminClient() {
  const { supabaseUrl, secretKey } = getBrowserE2EAdminCredentials();
  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function recoveryUrl(email: string) {
  const environment = validateBrowserE2EEnvironment();
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'recovery',
    email,
  });
  if (error) throw error;
  expect(data.user?.email).toBe(email);
  expect(data.properties?.verification_type).toBe('recovery');
  if (!data.properties?.hashed_token)
    throw new Error('専用環境の再設定情報を取得できませんでした。');
  const url = new URL('/reset-password', environment.webUrl);
  url.hash = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: 'recovery',
  }).toString();
  return url.href;
}

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(user.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(user.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL(
    `${validateBrowserE2EEnvironment().webUrl}/projects`,
  );
}

function userMenu(page: Page) {
  return page
    .getByRole('complementary')
    .getByRole('button', { name: 'ユーザーメニュー', exact: true });
}

async function fillPasswords(page: Page, password: string) {
  await page.getByLabel(/^新しいパスワード\s*\*?$/).fill(password);
  await page.getByLabel(/^新しいパスワード（確認）\s*\*?$/).fill(password);
}

async function cookieSnapshot(context: BrowserContext) {
  const { webUrl } = validateBrowserE2EEnvironment();
  return (await context.cookies(webUrl))
    .map(({ name, value, domain, path }) => ({ name, value, domain, path }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

test('招待中断後の復旧は別ユーザーのログインを維持し、名前未設定の本人へ手動ログインを案内する', async ({
  page,
  context,
  browser,
  testUser,
  invitationUser,
}, testInfo) => {
  const environment = validateBrowserE2EEnvironment();
  // 招待検証だけ成功し、名前・パスワードを保存せず画面を閉じた状態にする。
  const inviteToken = new URLSearchParams(
    new URL(invitationUser.url).hash.slice(1),
  ).get('token_hash');
  if (!inviteToken) throw new Error('専用招待情報がありません。');
  const invitation = adminClient();
  const verified = await invitation.auth.verifyOtp({
    token_hash: inviteToken,
    type: 'invite',
  });
  expect(verified.error).toBeNull();
  expect(verified.data.user?.user_metadata.name).toBeUndefined();
  expect((await invitation.auth.signOut({ scope: 'local' })).error).toBeNull();

  await login(page, testUser);
  const originalCookies = await cookieSnapshot(context);
  const reset = await context.newPage();
  let verifies = 0;
  reset.on('request', (request) => {
    if (request.url() === `${environment.supabaseUrl}/auth/v1/verify`)
      verifies += 1;
  });
  const response = await reset.goto(await recoveryUrl(invitationUser.email));
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(reset).toHaveURL(`${environment.webUrl}/reset-password`);
  await expect(
    reset.getByRole('button', { name: 'パスワードを再設定' }),
  ).toBeEnabled();
  expect(verifies).toBe(0);
  expect(await cookieSnapshot(context)).toEqual(originalCookies);
  await fillPasswords(reset, invitationUser.password);
  const logout = reset.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.origin === environment.supabaseUrl &&
      url.pathname === '/auth/v1/logout'
    );
  });
  await reset.getByRole('button', { name: 'パスワードを再設定' }).click();
  expect(new URL((await logout).url()).searchParams.get('scope')).toBe('local');
  await expect(reset.getByRole('status')).toContainText('再設定が完了しました');
  await expect(
    reset.getByRole('link', { name: 'ログイン画面へ' }),
  ).toHaveAttribute('href', '/login');
  expect(verifies).toBe(1);
  expect(await cookieSnapshot(context)).toEqual(originalCookies);
  await page.reload();
  await expect(userMenu(page)).toContainText(testUser.email);
  await reset.screenshot({
    path: testInfo.outputPath('reset-complete-desktop.png'),
    fullPage: true,
  });

  const recoveredContext = await browser.newContext({
    baseURL: environment.webUrl,
  });
  try {
    const recovered = await recoveredContext.newPage();
    await recovered.goto('/projects');
    await expect(recovered).toHaveURL(`${environment.webUrl}/login`);
    await login(recovered, invitationUser);
    await expect(userMenu(recovered)).toContainText(invitationUser.email);
    const result = await adminClient().auth.admin.getUserById(
      invitationUser.id,
    );
    expect(result.error).toBeNull();
    expect(result.data.user?.user_metadata.name).toBeUndefined();
  } finally {
    await recoveredContext.close();
  }
});

test('一時ログアウトの通信失敗でも保存完了を表示し、既存の名前を保持する', async ({
  page,
  context,
  browser,
  testUser,
}, testInfo) => {
  const environment = validateBrowserE2EEnvironment();
  const password = `${testUser.password}New`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`${environment.supabaseUrl}/auth/v1/logout*`, (route) =>
    route.abort('failed'),
  );
  await page.goto(await recoveryUrl(testUser.email));
  await fillPasswords(page, password);
  await page.getByRole('button', { name: 'パスワードを再設定' }).click();
  await expect(page.getByRole('status')).toContainText('再設定が完了しました');
  await expect(page.getByRole('status')).toContainText(
    'このタブを閉じてからログイン画面',
  );
  await expect(page.getByRole('link', { name: 'ログイン画面へ' })).toHaveCount(
    0,
  );
  expect(await cookieSnapshot(context)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('reset-complete-mobile.png'),
    fullPage: true,
  });

  const recoveredContext = await browser.newContext({
    baseURL: environment.webUrl,
  });
  try {
    const recovered = await recoveredContext.newPage();
    await login(recovered, { email: testUser.email, password });
    await expect(userMenu(recovered)).toContainText(testUser.name);
    await expect(userMenu(recovered)).toContainText(testUser.email);
  } finally {
    await recoveredContext.close();
  }
});

test('保存成功後に応答だけ失われた場合は、同じ内容の再送でも完了を断定しない', async ({
  page,
  testUser,
}) => {
  const environment = validateBrowserE2EEnvironment();
  let updates = 0;
  let savedStatus: number | undefined;
  await page.route(`${environment.supabaseUrl}/auth/v1/user`, async (route) => {
    if (route.request().method() === 'PUT' && ++updates === 1) {
      const response = await route.fetch();
      savedStatus = response.status();
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.goto(await recoveryUrl(testUser.email));
  await fillPasswords(page, `${testUser.password}New`);
  await page.getByRole('button', { name: 'パスワードを再設定' }).click();
  const alert = page
    .getByRole('form', { name: 'パスワード再設定フォーム' })
    .getByRole('alert');
  await expect(alert).toContainText('保存できたか確認できませんでした');
  expect(savedStatus).toBe(200);
  const retry = page.waitForResponse(
    (response) =>
      response.url() === `${environment.supabaseUrl}/auth/v1/user` &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'パスワードを再設定' }).click();
  expect((await (await retry).json()).code).toBe('same_password');
  await expect(alert).toContainText('保存できたか確認できませんでした');
  await expect(page.getByRole('status')).toHaveCount(0);
});
