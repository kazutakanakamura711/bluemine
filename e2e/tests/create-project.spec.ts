import { randomUUID } from 'node:crypto';

import { expect, test } from '../fixtures/test-user.js';

test('Projectを作成でき、再読み込み後も一覧とサイドバーに表示される', async ({
  page,
  testUser,
}) => {
  // キーは英数字20文字以内で、実行ごとに異なる値にする。
  const projectKey = `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const projectName = `ブラウザE2E ${projectKey}`;
  const description = 'ブラウザから作成したプロジェクトです。';

  // 一時ユーザーで、既存のログインフォームからログインする。
  await page.goto('/login');
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(testUser.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(testUser.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3100/projects');

  // 一覧の導線から作成画面へ進み、フォームを送信する。
  await page
    .getByRole('button', { name: '新規プロジェクト', exact: true })
    .click();
  await expect(page).toHaveURL('http://localhost:3100/projects/new');
  await page.getByLabel(/^プロジェクト名\s*\*?$/).fill(projectName);
  await page.getByLabel(/^プロジェクトキー\s*\*?$/).fill(projectKey);
  await page.getByLabel('説明', { exact: true }).fill(description);
  await page
    .getByRole('button', { name: 'プロジェクトを作成', exact: true })
    .click();

  // 作成直後の一覧と、共通レイアウトのサイドバーへの反映を確認する。
  await expect(page).toHaveURL('http://localhost:3100/projects');
  const projectRow = page
    .getByRole('table', { name: 'プロジェクト一覧', exact: true })
    .getByRole('link', { name: `${projectName}の詳細を開く`, exact: true });
  const sidebarProject = page
    .getByRole('complementary')
    .getByRole('link', { name: projectName });

  await expect(projectRow).toBeVisible();
  await expect(projectRow).toContainText(projectName);
  await expect(projectRow).toContainText(projectKey);
  await expect(projectRow).toContainText(description);
  await expect(sidebarProject).toBeVisible();
  await expect(sidebarProject).toContainText(projectKey);

  // 再取得した画面でも、保存した内容が残ることを確認する。
  await page.reload();

  await expect(page).toHaveURL('http://localhost:3100/projects');
  await expect(projectRow).toBeVisible();
  await expect(projectRow).toContainText(projectName);
  await expect(projectRow).toContainText(projectKey);
  await expect(projectRow).toContainText(description);
  await expect(sidebarProject).toBeVisible();
  await expect(sidebarProject).toContainText(projectKey);
});
