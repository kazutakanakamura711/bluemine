import { randomUUID } from 'node:crypto';

import { expect, test } from '../fixtures/test-user.js';

test('Projectをアーカイブ・解除でき、再読み込み後も状態が表示される', async ({
  page,
  testUser,
}) => {
  const projectKey = `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const projectName = `アーカイブ確認 ${projectKey}`;
  const description = 'アーカイブ・解除後も保持される説明です。';

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
  await page.getByLabel(/^プロジェクト名\s*\*?$/).fill(projectName);
  await page.getByLabel(/^プロジェクトキー\s*\*?$/).fill(projectKey);
  await page.getByLabel('説明', { exact: true }).fill(description);
  await page
    .getByRole('button', { name: 'プロジェクトを作成', exact: true })
    .click();
  await expect(page).toHaveURL('http://localhost:3100/projects');

  const projectRow = page
    .getByRole('table', { name: 'プロジェクト一覧', exact: true })
    .getByRole('link', { name: `${projectName}の詳細を開く`, exact: true });
  await expect(projectRow.getByText('進行中', { exact: true })).toBeVisible();
  await projectRow.click();
  await expect(page).toHaveURL(
    /^http:\/\/localhost:3100\/projects\/[^/?]+\/tasks$/,
  );
  const tasksUrl = page.url();
  const projectUrl = tasksUrl.slice(0, -'/tasks'.length);
  const settingUrl = `${projectUrl}/setting`;

  const settingsLink = page
    .getByRole('navigation', { name: 'プロジェクト詳細', exact: true })
    .getByRole('link', { name: '設定', exact: true });
  const heading = page.getByRole('heading', { name: projectName, exact: true });
  const archiveNotice = page.getByRole('status').filter({
    hasText: 'このプロジェクトはアーカイブ済みです。',
  });
  const sidebarProject = page
    .getByRole('complementary')
    .getByRole('link', { name: projectName });
  const projectsBreadcrumb = page
    .getByRole('navigation', { name: 'breadcrumb', exact: true })
    .getByRole('link', { name: 'プロジェクト一覧', exact: true });

  // 設定から確認ダイアログを開き、名前が一致するまで実行できないことを確認する。
  await settingsLink.click();
  await expect(page).toHaveURL(settingUrl);
  await page.getByRole('button', { name: 'アーカイブ', exact: true }).click();

  const archiveDialog = page.getByRole('alertdialog', {
    name: 'プロジェクトをアーカイブ',
    exact: true,
  });
  const archiveButton = archiveDialog.getByRole('button', {
    name: 'アーカイブする',
    exact: true,
  });
  const confirmationInput =
    archiveDialog.getByLabel(/確認のため.*と入力してください/);
  await expect(archiveDialog).toBeVisible();
  await expect(archiveButton).toBeDisabled();
  await confirmationInput.fill('別のプロジェクト名');
  await expect(archiveButton).toBeDisabled();
  await confirmationInput.fill(projectName);
  await expect(archiveButton).toBeEnabled();
  await archiveButton.click();

  // アーカイブ直後に設定URLから戻り、案内とサイドバーへ状態が反映される。
  await expect(archiveDialog).not.toBeVisible();
  await expect(page).toHaveURL(tasksUrl);
  await expect(heading).toBeVisible();
  await expect(archiveNotice).toBeVisible();
  await expect(sidebarProject).toBeVisible();
  await expect(sidebarProject).toContainText('アーカイブ済み');

  await page.reload();

  await expect(page).toHaveURL(tasksUrl);
  await expect(heading).toBeVisible();
  await expect(archiveNotice).toBeVisible();
  await expect(sidebarProject).toBeVisible();
  await expect(sidebarProject).toContainText('アーカイブ済み');

  // 一覧でもデータが保持され、再読み込み後もアーカイブ済みであることを確認する。
  await projectsBreadcrumb.click();
  await expect(page).toHaveURL('http://localhost:3100/projects');
  await expect(
    projectRow.getByText('アーカイブ済み', { exact: true }),
  ).toBeVisible();
  await expect(projectRow).toContainText(projectName);
  await expect(projectRow).toContainText(projectKey);
  await expect(projectRow).toContainText(description);

  await page.reload();

  await expect(
    projectRow.getByText('アーカイブ済み', { exact: true }),
  ).toBeVisible();
  await expect(sidebarProject).toContainText('アーカイブ済み');

  // アーカイブ済みのProjectを開き直し、設定から解除する。
  await projectRow.click();
  await expect(page).toHaveURL(tasksUrl);
  await settingsLink.click();
  await expect(page).toHaveURL(settingUrl);
  await page
    .getByRole('button', { name: 'アーカイブを解除', exact: true })
    .click();

  await expect(page).toHaveURL(tasksUrl);
  await expect(heading).toBeVisible();
  await expect(archiveNotice).toHaveCount(0);
  await expect(sidebarProject).toBeVisible();
  await expect(sidebarProject).not.toContainText('アーカイブ済み');

  await page.reload();

  await expect(page).toHaveURL(tasksUrl);
  await expect(heading).toBeVisible();
  await expect(archiveNotice).toHaveCount(0);
  await expect(sidebarProject).toBeVisible();
  await expect(sidebarProject).not.toContainText('アーカイブ済み');

  // 解除後は通常のアーカイブボタンへ戻り、一覧にも進行中として表示される。
  await settingsLink.click();
  await expect(page).toHaveURL(settingUrl);
  await expect(
    page.getByRole('button', { name: 'アーカイブ', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'アーカイブを解除', exact: true }),
  ).toHaveCount(0);

  await projectsBreadcrumb.click();
  await expect(page).toHaveURL('http://localhost:3100/projects');
  await expect(projectRow.getByText('進行中', { exact: true })).toBeVisible();
  await expect(projectRow).toContainText(projectName);
  await expect(projectRow).toContainText(projectKey);
  await expect(projectRow).toContainText(description);

  await page.reload();

  await expect(projectRow.getByText('進行中', { exact: true })).toBeVisible();
  await expect(sidebarProject).toBeVisible();
  await expect(sidebarProject).not.toContainText('アーカイブ済み');
});
