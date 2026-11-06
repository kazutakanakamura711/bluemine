import { randomUUID } from 'node:crypto';

import { expect, test } from '../fixtures/test-user.js';

test('Projectの設定を更新でき、再読み込み後も変更が表示される', async ({
  page,
  testUser,
}) => {
  const projectKey = `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const initialName = `更新前 ${projectKey}`;
  const updatedName = `更新後 ${projectKey}`;
  const initialDescription = '設定を更新する前の説明です。';
  const updatedDescription = 'ブラウザから設定を更新した後の説明です。';

  // 一時ユーザーでログインし、このテスト専用のProjectを作成する。
  await page.goto('/login');
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(testUser.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(testUser.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3100/projects');

  await page
    .getByRole('button', { name: '新規プロジェクト', exact: true })
    .click();
  await expect(page).toHaveURL('http://localhost:3100/projects/new');
  await page.getByLabel(/^プロジェクト名\s*\*?$/).fill(initialName);
  await page.getByLabel(/^プロジェクトキー\s*\*?$/).fill(projectKey);
  await page.getByLabel('説明', { exact: true }).fill(initialDescription);
  await page
    .getByRole('button', { name: 'プロジェクトを作成', exact: true })
    .click();
  await expect(page).toHaveURL('http://localhost:3100/projects');

  // 一覧から詳細を開き、ownerだけが使える設定の導線へ進む。
  const projectsTable = page.getByRole('table', {
    name: 'プロジェクト一覧',
    exact: true,
  });
  await projectsTable
    .getByRole('link', { name: `${initialName}の詳細を開く`, exact: true })
    .click();
  await expect(page).toHaveURL(
    /^http:\/\/localhost:3100\/projects\/[^/?]+\/tasks$/,
  );
  const tasksUrl = page.url();
  const projectUrl = tasksUrl.slice(0, -'/tasks'.length);
  const settingUrl = `${projectUrl}/setting`;

  const detailNavigation = page.getByRole('navigation', {
    name: 'プロジェクト詳細',
    exact: true,
  });
  const tasksLink = detailNavigation.getByRole('link', {
    name: 'タスク',
    exact: true,
  });
  const settingLink = detailNavigation.getByRole('link', {
    name: '設定',
    exact: true,
  });
  await expect(tasksLink).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByText('タスクはありません。', { exact: true }),
  ).toBeVisible();

  // プロジェクトの入口URLを直接開いても、タスク一覧へ移動する。
  await page.goto(projectUrl);
  await expect(page).toHaveURL(tasksUrl);

  // メンバーも含めて、それぞれ独立したページへ移動できる。
  const membersLink = detailNavigation.getByRole('link', {
    name: 'メンバー',
    exact: true,
  });
  await membersLink.click();
  await expect(page).toHaveURL(`${projectUrl}/members`);
  await expect(membersLink).toHaveAttribute('aria-current', 'page');
  await tasksLink.click();
  await expect(page).toHaveURL(tasksUrl);

  await page
    .getByRole('navigation', { name: 'プロジェクト詳細', exact: true })
    .getByRole('link', { name: '設定', exact: true })
    .click();
  await expect(page).toHaveURL(settingUrl);

  await page.goBack();
  await expect(page).toHaveURL(tasksUrl);
  await expect(tasksLink).toHaveAttribute('aria-current', 'page');
  await page.goForward();
  await expect(page).toHaveURL(settingUrl);
  await expect(settingLink).toHaveAttribute('aria-current', 'page');

  const nameInput = page.getByLabel(/^プロジェクト名\s*\*?$/);
  const descriptionInput = page.getByLabel('説明', { exact: true });
  const keyInput = page.getByLabel('プロジェクトキー', { exact: true });
  await expect(nameInput).toHaveValue(initialName);
  await expect(descriptionInput).toHaveValue(initialDescription);
  await expect(keyInput).toHaveValue(projectKey);

  await nameInput.fill(updatedName);
  await descriptionInput.fill(updatedDescription);
  await page.getByRole('button', { name: '設定を保存', exact: true }).click();

  // 入力欄だけでなく、再取得したヘッダー・パンくず・サイドバーを確認する。
  const heading = page.getByRole('heading', { name: updatedName, exact: true });
  const breadcrumb = page.getByRole('navigation', {
    name: 'breadcrumb',
    exact: true,
  });
  const currentBreadcrumb = breadcrumb.getByRole('link', {
    name: updatedName,
    exact: true,
  });
  const sidebarProject = page
    .getByRole('complementary')
    .getByRole('link', { name: updatedName });

  await expect(heading).toBeVisible();
  await expect(currentBreadcrumb).toBeVisible();
  await expect(sidebarProject).toBeVisible();
  await expect(sidebarProject).toContainText(projectKey);
  await expect(page).toHaveURL(settingUrl);

  // 再読み込み後も、設定URLと保存したフォーム値・各表示が残ることを確認する。
  await page.reload();

  await expect(page).toHaveURL(settingUrl);
  await expect(nameInput).toHaveValue(updatedName);
  await expect(descriptionInput).toHaveValue(updatedDescription);
  await expect(keyInput).toHaveValue(projectKey);
  await expect(heading).toBeVisible();
  await expect(currentBreadcrumb).toBeVisible();
  await expect(sidebarProject).toBeVisible();

  // パンくずから一覧へ戻り、保存した名前・キー・説明を確認する。
  await breadcrumb
    .getByRole('link', { name: 'プロジェクト一覧', exact: true })
    .click();
  await expect(page).toHaveURL('http://localhost:3100/projects');
  const projectRow = projectsTable.getByRole('link', {
    name: `${updatedName}の詳細を開く`,
    exact: true,
  });
  await expect(projectRow).toBeVisible();
  await expect(projectRow).toContainText(updatedName);
  await expect(projectRow).toContainText(projectKey);
  await expect(projectRow).toContainText(updatedDescription);

  await page.reload();

  await expect(projectRow).toBeVisible();
  await expect(projectRow).toContainText(updatedName);
  await expect(projectRow).toContainText(projectKey);
  await expect(projectRow).toContainText(updatedDescription);
  await expect(sidebarProject).toBeVisible();
});
