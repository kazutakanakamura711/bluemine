import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { validateBrowserE2EEnvironment } from '../environment.mjs';
import { expect, test } from '../fixtures/test-user.js';

test('PC・モバイルのタスク一覧から詳細を開き、再読み込みと一覧への復帰ができる', async ({
  page,
  testUser,
}, testInfo) => {
  const environment = validateBrowserE2EEnvironment();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
  });
  const projectKey = `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const projectName = 'Task閲覧確認';
  const title = 'ログイン機能';
  const description =
    'ログインに関連する機能全体の親タスク。\nJWT認証、ログイン画面、ログインAPIを含む。';

  try {
    await page.goto('/login');
    await page.getByLabel(/^メールアドレス\s*\*?$/).fill(testUser.email);
    await page.getByLabel(/^パスワード\s*\*?$/).fill(testUser.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(page).toHaveURL('http://localhost:3100/projects');

    // Task作成APIは未実装のため、今回のユーザー専用の閲覧データを用意する。
    const project = await prisma.project.create({
      data: {
        key: projectKey,
        name: projectName,
        ownerId: testUser.id,
        lastTaskNumber: 2,
        projectMembers: { create: { userId: testUser.id, role: 'owner' } },
        tasks: {
          create: [
            {
              number: 1,
              assigneeId: testUser.id,
              reporterId: testUser.id,
              title,
              description,
              status: 'in_progress',
              priority: 'high',
              startDate: new Date('2020-08-20T00:00:00.000Z'),
              dueDate: new Date('2020-09-15T00:00:00.000Z'),
            },
            {
              number: 2,
              reporterId: testUser.id,
              title: '日付未設定のタスク',
              status: 'todo',
              priority: 'normal',
            },
          ],
        },
      },
      include: { tasks: true },
    });
    const task = project.tasks.find((task) => task.title === title)!;
    const tasksPath = `/projects/${project.id}/tasks`;
    const detailPath = `${tasksPath}/${task.id}`;

    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(tasksPath);
      await expect(page.getByText('2件', { exact: true })).toBeVisible();
      await expect(
        page.getByText(`${projectKey} · オーナーとして参加中`),
      ).toBeVisible();
      const list =
        viewport.width >= 768
          ? page.getByRole('table', { name: 'タスク一覧', exact: true })
          : page.getByRole('list', {
              name: 'タスク一覧（モバイル）',
              exact: true,
            });
      const taskLink = list.getByRole('link', { name: title, exact: true });
      await expect(taskLink).toBeVisible();
      await expect(taskLink).toHaveAttribute('href', detailPath);
      const numberLink = list.getByRole('link', {
        name: `${projectKey}-${task.number}`,
        exact: true,
      });
      await expect(numberLink).toBeVisible();
      await expect(numberLink).toHaveAttribute('href', detailPath);
      await expect(list.getByText(testUser.name, { exact: true })).toHaveCount(
        3,
      );
      await expect(list.getByText('未担当', { exact: true })).toHaveCount(1);
      await expect(list.getByText('期限超過', { exact: true })).toHaveCount(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
      await page.screenshot({
        path: testInfo.outputPath(`task-list-${viewport.width}.png`),
        fullPage: true,
      });

      await (viewport.width >= 768 ? numberLink : taskLink).click();
      await expect(page).toHaveURL(`http://localhost:3100${detailPath}`);
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: `${projectKey}-${task.number}`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('navigation', { name: 'パンくずリスト', exact: true })
          .getByText(`${projectKey}-${task.number}`, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await expect(page.getByText(description, { exact: true })).toBeVisible();
      await expect(
        page.getByRole('complementary', { name: '属性', exact: true }),
      ).toBeVisible();
      const properties = page.getByRole('complementary', {
        name: '属性',
        exact: true,
      });
      await expect(
        properties.getByText('担当者', { exact: true }),
      ).toBeVisible();
      await expect(
        properties.getByText('報告者', { exact: true }),
      ).toBeVisible();
      await expect(
        properties.getByText(testUser.name, { exact: true }),
      ).toHaveCount(2);
      await page.screenshot({
        path: testInfo.outputPath(`task-detail-${viewport.width}.png`),
        fullPage: true,
      });

      await page.reload();
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await page
        .getByRole('navigation', { name: 'パンくずリスト', exact: true })
        .getByRole('link', { name: projectName, exact: true })
        .click();
      await expect(page).toHaveURL(`http://localhost:3100${tasksPath}`);
      await expect(taskLink).toBeVisible();
    }
  } finally {
    try {
      await page.context().close();
    } finally {
      try {
        // Projectの削除は既存fixtureに任せ、その前に今回のユーザーのTaskを片付ける。
        await prisma.task.deleteMany({
          where: { project: { ownerId: testUser.id } },
        });
      } finally {
        await prisma.$disconnect();
      }
    }
  }
});
