import type { BrowserContext, Page } from '@playwright/test';

import { validateBrowserE2EEnvironment } from '../environment.mjs';
import { expect, test } from '../fixtures/invitation-user.js';

type LoginUser = { email: string; password: string };
type SetupUser = { name: string; password: string };

async function login(page: Page, user: LoginUser) {
  await page.goto('/login');
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(user.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(user.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3100/projects');
}

function userMenu(page: Page) {
  return page.getByRole('complementary').getByRole('button', {
    name: 'ユーザーメニュー',
    exact: true,
  });
}

async function fillSetup(page: Page, user: SetupUser) {
  await page.getByLabel(/^名前\s*\*?$/).fill(user.name);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(user.password);
  await page.getByLabel(/^パスワード（確認）\s*\*?$/).fill(user.password);
}

async function cookieSnapshot(context: BrowserContext) {
  const cookies = await context.cookies('http://localhost:3100');
  return cookies
    .map(({ name, value, domain, path }) => ({ name, value, domain, path }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

test('招待画面の表示は招待を消費せず、保存失敗後の再試行も既存ログインを維持する', async ({
  page,
  context,
  browser,
  testUser,
  invitationUser,
}) => {
  const environment = validateBrowserE2EEnvironment();
  await login(page, testUser);
  await expect(userMenu(page)).toContainText(testUser.email);
  const cookiesBefore = await cookieSnapshot(context);
  const setup = await context.newPage();
  let verifyCount = 0;
  let updateCount = 0;
  setup.on('request', (request) => {
    if (
      request.url() === `${environment.supabaseUrl}/auth/v1/verify` &&
      request.method() === 'POST'
    ) {
      verifyCount += 1;
    }
  });

  await setup.goto(invitationUser.url);
  await expect(setup).toHaveURL(`${environment.webUrl}/invitation`);
  await expect(
    setup.getByRole('button', { name: '初期設定を完了' }),
  ).toBeEnabled();
  await expect(
    setup.getByText(
      '設定が完了するまで、再読み込みやタブを閉じないでください。',
    ),
  ).toBeVisible();
  expect(verifyCount).toBe(0);
  expect(await invitationUser.isConfirmed()).toBe(false);
  expect(await cookieSnapshot(context)).toEqual(cookiesBefore);

  // 検証後の保存リクエストだけを最初の1回中断する。
  await setup.route(`${environment.supabaseUrl}/auth/v1/user`, (route) => {
    if (route.request().method() === 'PUT' && ++updateCount === 1) {
      return route.abort('failed');
    }
    return route.continue();
  });
  await fillSetup(setup, invitationUser);
  await setup.getByRole('button', { name: '初期設定を完了' }).click();
  await expect(
    setup
      .getByRole('form', { name: '招待の初期設定フォーム' })
      .getByRole('alert'),
  ).toContainText('保存できたか確認できませんでした');
  expect(await invitationUser.isConfirmed()).toBe(true);
  expect(verifyCount).toBe(1);
  expect(await cookieSnapshot(context)).toEqual(cookiesBefore);
  await page.reload();
  await expect(userMenu(page)).toContainText(testUser.email);

  await setup.getByRole('button', { name: '初期設定を完了' }).click();
  await expect(setup.getByRole('status')).toContainText(
    '初期設定が完了しました',
  );
  expect(updateCount).toBe(2);
  expect(verifyCount).toBe(1);
  expect(await cookieSnapshot(context)).toEqual(cookiesBefore);
  await page.reload();
  await expect(userMenu(page)).toContainText(testUser.email);
  await expect(userMenu(page)).not.toContainText(invitationUser.email);

  const invitedContext = await browser.newContext({
    baseURL: environment.webUrl,
  });
  try {
    const invitedPage = await invitedContext.newPage();
    await login(invitedPage, invitationUser);
    await expect(userMenu(invitedPage)).toContainText(invitationUser.email);
    await expect(userMenu(invitedPage)).toContainText(invitationUser.name);
  } finally {
    await invitedContext.close();
  }
});

test('不正な招待リンクは受け付けず管理者への連絡を案内する', async ({
  page,
}) => {
  await page.goto('/invitation#token_hash=invalid-test-token&type=invite');
  await fillSetup(page, { name: '招待テスト', password: 'password123' });
  await page.getByRole('button', { name: '初期設定を完了' }).click();
  await expect(
    page
      .getByRole('form', { name: '招待の初期設定フォーム' })
      .getByRole('alert'),
  ).toContainText('招待リンクが無効');
  await expect(
    page
      .getByRole('form', { name: '招待の初期設定フォーム' })
      .getByRole('alert'),
  ).toContainText('管理者にご連絡ください');
  await expect(
    page.getByRole('button', { name: '初期設定を完了' }),
  ).toBeDisabled();
});

test('保存成功の応答が失われた後、同じ内容の再送が拒否されても結果不明の案内を維持する', async ({
  page,
  browser,
  invitationUser,
}) => {
  const environment = validateBrowserE2EEnvironment();
  let updateCount = 0;
  let savedResponseStatus: number | undefined;
  await page.route(`${environment.supabaseUrl}/auth/v1/user`, async (route) => {
    if (route.request().method() === 'PUT' && ++updateCount === 1) {
      // サーバーでの保存完了を待ち、その応答だけをブラウザへ返さない。
      const response = await route.fetch();
      savedResponseStatus = response.status();
      return route.abort('failed');
    }
    return route.continue();
  });

  await page.goto(invitationUser.url);
  await fillSetup(page, invitationUser);
  await page.getByRole('button', { name: '初期設定を完了' }).click();
  const alert = page
    .getByRole('form', { name: '招待の初期設定フォーム' })
    .getByRole('alert');
  await expect(alert).toContainText('保存できたか確認できませんでした');
  expect(savedResponseStatus).toBe(200);

  const retryResponse = page.waitForResponse(
    (response) =>
      response.url() === `${environment.supabaseUrl}/auth/v1/user` &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: '初期設定を完了' }).click();
  const rejected = await retryResponse;
  expect(rejected.status()).toBe(422);
  expect((await rejected.json()).code).toBe('same_password');
  await expect(
    page.getByRole('button', { name: '初期設定を完了' }),
  ).toBeEnabled();
  await expect(alert).toContainText('保存できたか確認できませんでした');
  await expect(alert).toContainText('ログインをお試しください');
  await expect(alert).not.toContainText('設定を保存できませんでした');

  // 成功を断定しない案内でも、実際には最初の入力で保存済みとなっている。
  const invitedContext = await browser.newContext({
    baseURL: environment.webUrl,
  });
  try {
    const invitedPage = await invitedContext.newPage();
    await login(invitedPage, invitationUser);
    await expect(userMenu(invitedPage)).toContainText(invitationUser.name);
    await expect(userMenu(invitedPage)).toContainText(invitationUser.email);
  } finally {
    await invitedContext.close();
  }
});

test('招待検証後に画面を再読み込みした場合は復旧を案内する', async ({
  page,
  invitationUser,
}) => {
  const { supabaseUrl } = validateBrowserE2EEnvironment();
  await page.goto(invitationUser.url);
  await page.route(`${supabaseUrl}/auth/v1/user`, (route) => {
    if (route.request().method() === 'PUT') return route.abort('failed');
    return route.continue();
  });
  await fillSetup(page, invitationUser);
  await page.getByRole('button', { name: '初期設定を完了' }).click();
  await expect(
    page
      .getByRole('form', { name: '招待の初期設定フォーム' })
      .getByRole('alert'),
  ).toContainText('保存できたか確認できませんでした');
  expect(await invitationUser.isConfirmed()).toBe(true);

  await page.reload();
  await expect(
    page
      .getByRole('form', { name: '招待の初期設定フォーム' })
      .getByRole('alert'),
  ).toContainText('管理者にご連絡ください');
  await expect(
    page.getByRole('button', { name: '初期設定を完了' }),
  ).toBeDisabled();

  // 元のリンクを再度開いても、検証済みの招待は再利用できない。
  await page.goto(invitationUser.url);
  await fillSetup(page, invitationUser);
  await page.getByRole('button', { name: '初期設定を完了' }).click();
  await expect(
    page
      .getByRole('form', { name: '招待の初期設定フォーム' })
      .getByRole('alert'),
  ).toContainText('招待リンクが無効');
});
