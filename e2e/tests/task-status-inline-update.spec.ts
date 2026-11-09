import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { validateBrowserE2EEnvironment } from '../environment.mjs';
import { expect, test } from '../fixtures/test-user.js';

test('ステータス更新の保存中・失敗・再試行を確認する', async ({
  page,
  testUser,
}) => {
  const environment = validateBrowserE2EEnvironment();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
  });
  let projectId: string | undefined;
  let releaseResponse!: () => void;

  try {
    await page.goto('/login');
    await page.getByLabel(/^メールアドレス\s*\*?$/).fill(testUser.email);
    await page.getByLabel(/^パスワード\s*\*?$/).fill(testUser.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(page).toHaveURL(`${environment.webUrl}/projects`);

    const project = await prisma.project.create({
      data: {
        name: 'ステータス行内編集確認',
        key: `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        ownerId: testUser.id,
        projectMembers: { create: { userId: testUser.id, role: 'owner' } },
        tasks: {
          create: {
            number: 1,
            title: 'ステータスを更新するタスク',
            status: 'todo',
            reporterId: testUser.id,
          },
        },
      },
      include: { tasks: true },
    });
    projectId = project.id;
    const task = project.tasks[0];
    if (!task) throw new Error('テスト用Taskを作成できませんでした');

    const apiUrl = `${environment.apiUrl}/api/projects/${project.id}/tasks/${task.id}`;
    const gate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let patchCount = 0;
    await page.route(apiUrl, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      patchCount += 1;

      if (patchCount === 1) {
        await gate;
        return route.fulfill({
          status: 409,
          headers: { 'Access-Control-Allow-Origin': environment.webUrl },
          json: { message: 'テスト用の更新失敗です' },
        });
      }

      return route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': environment.webUrl },
        json: {
          id: task.id,
          projectId: task.projectId,
          number: task.number,
          title: task.title,
          description: task.description,
          status: 'in_progress',
          priority: task.priority,
          assignee: null,
          reporter: { id: testUser.id, name: testUser.name },
          startDate: null,
          dueDate: null,
          createdAt: task.createdAt.toISOString(),
          // 再取得が届く前の保存結果を表示できるよう、模擬応答を新しい日時にする。
          updatedAt: '2099-01-01T00:00:00.000Z',
        },
      });
    });

    await page.goto(`/projects/${project.id}/tasks/${task.id}`);
    const statusSelect = page.getByRole('combobox', {
      name: 'ステータス',
      exact: true,
    });
    await statusSelect.click();
    await page.getByRole('option', { name: '完了', exact: true }).click();

    await expect.poll(() => patchCount).toBe(1);
    await expect(statusSelect).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('保存中...');
    await expect(statusSelect).toContainText('未着手');
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status,
    ).toBe('todo');

    releaseResponse();
    await expect(
      page.getByText('テスト用の更新失敗です', { exact: true }),
    ).toBeVisible();
    await expect(statusSelect).toBeEnabled();
    await expect(statusSelect).toContainText('未着手');
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status,
    ).toBe('todo');

    await statusSelect.click();
    await page.getByRole('option', { name: '進行中', exact: true }).click();
    await expect.poll(() => patchCount).toBe(2);
    await expect(statusSelect).toContainText('進行中');
    await expect(
      page.getByText('ステータスを「進行中」に変更しました', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status,
    ).toBe('todo');
  } finally {
    releaseResponse?.();
    try {
      await page.context().close();
    } finally {
      try {
        if (projectId) {
          await prisma.task.deleteMany({
            where: { projectId, project: { ownerId: testUser.id } },
          });
        }
      } finally {
        await prisma.$disconnect();
      }
    }
  }
});
