import {
  expect,
  test,
  waitForConfirmationUrl,
} from '../fixtures/registration-user.js';

test('新規登録の確認メールからログインでき、再読み込み後も本人の情報が表示される', async ({
  page,
  registrationUser,
}) => {
  // 管理APIによる事前作成やメール確認を使わず、登録フォームから操作する。
  await page.goto('/register');
  await page.getByLabel(/^名前\s*\*?$/).fill(registrationUser.name);
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(registrationUser.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(registrationUser.password);
  await page
    .getByLabel(/^パスワード（確認）\s*\*?$/)
    .fill(registrationUser.password);
  await page
    .getByRole('button', { name: 'アカウントを作成', exact: true })
    .click();

  await expect(page.getByRole('status')).toHaveText(
    '登録を受け付けました。確認メールのリンクを開くと、メール確認が完了し、自動的にアプリへ進みます。',
  );
  await expect(page).toHaveURL('http://localhost:3100/register');

  // 確認前にはセッションがなく、保護された画面を開いてもログインへ戻る。
  await page.goto('/projects');
  await expect(page).toHaveURL('http://localhost:3100/login');

  // 今回の宛先に届いたメールのリンクを、実際のブラウザで開く。
  const confirmationUrl = await waitForConfirmationUrl(registrationUser.email);
  await page.goto(confirmationUrl);

  await expect(page).toHaveURL('http://localhost:3100/projects');
  const heading = page.getByRole('heading', {
    name: 'プロジェクト一覧',
    exact: true,
  });
  const userMenu = page
    .getByRole('complementary')
    .getByRole('button', { name: 'ユーザーメニュー', exact: true });
  await expect(heading).toBeVisible();
  await expect(userMenu).toContainText(registrationUser.name);
  await expect(userMenu).toContainText(registrationUser.email);

  // Cookieによるログイン状態が、再読み込み後も維持されることを確認する。
  await page.reload();

  await expect(page).toHaveURL('http://localhost:3100/projects');
  await expect(heading).toBeVisible();
  await expect(userMenu).toContainText(registrationUser.name);
  await expect(userMenu).toContainText(registrationUser.email);
});
