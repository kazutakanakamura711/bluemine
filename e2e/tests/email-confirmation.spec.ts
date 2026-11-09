import { mergeTests, type Page } from '@playwright/test';

import {
  expect,
  test as registrationTest,
  waitForConfirmationUrl,
} from '../fixtures/registration-user.js';
import { test as userTest } from '../fixtures/test-user.js';

const test = mergeTests(registrationTest, userTest);

async function register(
  page: Page,
  user: { name: string; email: string; password: string },
) {
  await page.goto('/register');
  await page.getByLabel(/^名前\s*\*?$/).fill(user.name);
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(user.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(user.password);
  await page.getByLabel(/^パスワード（確認）\s*\*?$/).fill(user.password);
  await page
    .getByRole('button', { name: 'アカウントを作成', exact: true })
    .click();

  await expect(page.getByRole('status')).toHaveText(
    '登録を受け付けました。確認メールのリンクを開いてメールアドレスを確認し、ログインしてください。',
  );
}

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(user.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(user.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3100/projects');
}

function userMenu(page: Page) {
  return page
    .getByRole('complementary')
    .getByRole('button', { name: 'ユーザーメニュー', exact: true });
}

test('確認後はログインせず、手動ログイン後に本人の情報が維持される', async ({
  page,
  registrationUser,
}) => {
  await register(page, registrationUser);
  await page.goto('/projects');
  await expect(page).toHaveURL('http://localhost:3100/login');

  const confirmationUrl = await waitForConfirmationUrl(registrationUser.email);
  await page.goto(confirmationUrl);
  await expect(page).toHaveURL(
    'http://localhost:3100/login?confirmation=success',
  );
  await expect(page.getByRole('status')).toContainText(
    'メールアドレスの確認が完了しました。',
  );
  await page.goto('/projects');
  await expect(page).toHaveURL('http://localhost:3100/login');

  // 使用済みリンクは失敗し、その後も確認済みアカウントでログインできる。
  await page.goto(confirmationUrl);
  await expect(page).toHaveURL(
    'http://localhost:3100/login?error=confirmation_failed',
  );
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'メールアドレスを確認できませんでした。' }),
  ).toBeVisible();
  await login(page, registrationUser);
  await expect(userMenu(page)).toContainText(registrationUser.email);
  await page.reload();
  await expect(userMenu(page)).toContainText(registrationUser.name);
  await expect(userMenu(page)).toContainText(registrationUser.email);
});

test('登録していないブラウザで確認しても自動ログインしない', async ({
  page,
  browser,
  registrationUser,
}) => {
  await register(page, registrationUser);
  const confirmationUrl = await waitForConfirmationUrl(registrationUser.email);
  const otherContext = await browser.newContext({
    baseURL: 'http://localhost:3100',
  });

  try {
    const otherPage = await otherContext.newPage();
    await otherPage.goto(confirmationUrl);
    await expect(otherPage).toHaveURL(
      'http://localhost:3100/login?confirmation=success',
    );
    await otherPage.goto('/projects');
    await expect(otherPage).toHaveURL('http://localhost:3100/login');
    await login(otherPage, registrationUser);
    await expect(userMenu(otherPage)).toContainText(registrationUser.email);
  } finally {
    await otherContext.close();
  }
});

test('別アカウントでログイン中に確認リンクを開いても本人が変わらない', async ({
  page,
  browser,
  registrationUser,
  testUser,
}) => {
  await register(page, registrationUser);
  const confirmationUrl = await waitForConfirmationUrl(registrationUser.email);
  const otherContext = await browser.newContext({
    baseURL: 'http://localhost:3100',
  });

  try {
    const otherPage = await otherContext.newPage();
    await login(otherPage, testUser);
    await expect(userMenu(otherPage)).toContainText(testUser.email);
    await otherPage.goto(confirmationUrl);
    await expect(otherPage).toHaveURL(
      'http://localhost:3100/login?confirmation=success',
    );
    await expect(otherPage.getByRole('status')).toContainText(
      'ログイン中のアカウントは変更されていません。',
    );
    await otherPage.goto('/projects');
    await expect(userMenu(otherPage)).toContainText(testUser.email);
    await expect(userMenu(otherPage)).not.toContainText(registrationUser.email);
    await otherPage.reload();
    await expect(userMenu(otherPage)).toContainText(testUser.email);

    // 無効な確認リンクでもログイン中のセッションを維持する。
    await otherPage.goto('/confirm?token_hash=invalid-token&type=email');
    await expect(otherPage).toHaveURL(
      'http://localhost:3100/login?error=confirmation_failed',
    );
    await otherPage.goto('/projects');
    await expect(userMenu(otherPage)).toContainText(testUser.email);
  } finally {
    await otherContext.close();
  }
});
