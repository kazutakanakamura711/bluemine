import { expect, test } from '../fixtures/test-user.js';

test('ログイン画面が表示される', async ({ page }) => {
  await page.goto('/login');

  await expect(
    page.getByRole('heading', { name: 'ログイン', exact: true }),
  ).toBeVisible();

  await expect(page.getByLabel(/^メールアドレス\s*\*?$/)).toBeVisible();

  await expect(page.getByLabel(/^パスワード\s*\*?$/)).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'ログイン', exact: true }),
  ).toBeVisible();
});

test('ログインでき、再読み込み後も本人の情報が表示される', async ({
  page,
  testUser,
}) => {
  await page.goto('/login');
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(testUser.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(testUser.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();

  await expect(page).toHaveURL('http://localhost:3100/projects');
  await expect(
    page.getByRole('heading', { name: 'プロジェクト一覧', exact: true }),
  ).toBeVisible();
  const userMenu = page
    .getByRole('complementary')
    .getByRole('button', { name: 'ユーザーメニュー', exact: true });
  await expect(userMenu).toContainText(testUser.name);
  await expect(userMenu).toContainText(testUser.email);

  await page.reload();

  await expect(page).toHaveURL('http://localhost:3100/projects');
  await expect(
    page.getByRole('heading', { name: 'プロジェクト一覧', exact: true }),
  ).toBeVisible();
  await expect(userMenu).toContainText(testUser.name);
  await expect(userMenu).toContainText(testUser.email);
});
