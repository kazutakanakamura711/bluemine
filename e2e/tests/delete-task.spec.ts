import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Page } from '@playwright/test';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { validateBrowserE2EEnvironment } from '../environment.mjs';
import { expect, test } from '../fixtures/test-user.js';

type TestUser = {
  id: string;
  email: string;
  password: string;
};

// テスト専用ユーザーでログインし、そのユーザーだけのProjectとTaskを用意する。
async function prepareTasks(page: Page, prisma: PrismaClient, user: TestUser) {
  await page.goto('/login');
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(user.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(user.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3100/projects');

  return prisma.project.create({
    data: {
      name: 'タスク削除確認',
      key: `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      ownerId: user.id,
      lastTaskNumber: 3,
      projectMembers: { create: { userId: user.id, role: 'owner' } },
      tasks: {
        create: [1, 2, 3].map((number) => ({
          number,
          title: `削除確認タスク ${number}`,
          reporterId: user.id,
        })),
      },
    },
    include: { tasks: true },
  });
}

async function openDeleteDialog(page: Page) {
  await page.getByRole('button', { name: '削除', exact: true }).click();
  const dialog = page.getByRole('alertdialog', {
    name: 'タスクを削除',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('PC・モバイルでキャンセルと削除を行い、他のTaskを保持して一覧へ戻る', async ({
  page,
  testUser,
}, testInfo) => {
  test.setTimeout(120_000);
  const environment = validateBrowserE2EEnvironment();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
  });
  const projectIds: string[] = [];
  const releaseResponses: Array<() => void> = [];

  try {
    const project = await prepareTasks(page, prisma, testUser);
    projectIds.push(project.id);
    const tasksPath = `/projects/${project.id}/tasks`;

    for (const viewport of [
      { width: 1280, height: 900, number: 1 },
      { width: 390, height: 844, number: 2 },
    ]) {
      const task = project.tasks.find(
        ({ number }) => number === viewport.number,
      );
      if (!task) throw new Error('テスト用Taskが見つかりません');
      const detailPath = `${tasksPath}/${task.id}`;
      const apiUrl = `${environment.apiUrl}/api/projects/${project.id}/tasks/${task.id}`;

      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(tasksPath);
      const list =
        viewport.width >= 768
          ? page.getByRole('table', { name: 'タスク一覧', exact: true })
          : page.getByRole('list', {
              name: 'タスク一覧（モバイル）',
              exact: true,
            });
      await list.getByRole('link', { name: task.title, exact: true }).click();
      await expect(page).toHaveURL(`http://localhost:3100${detailPath}`);

      const dialog = await openDeleteDialog(page);
      await expect(dialog).toContainText(
        `${project.key}-${task.number}「${task.title}」`,
      );
      await expect(dialog).toContainText('この操作は元に戻せません。');
      await expect(
        dialog.getByRole('button', { name: 'キャンセル' }),
      ).toBeFocused();
      await page.screenshot({
        path: testInfo.outputPath(`delete-task-dialog-${viewport.width}.png`),
        fullPage: true,
        animations: 'disabled',
      });
      await dialog.getByRole('button', { name: 'キャンセル' }).click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole('button', { name: '削除', exact: true }),
      ).toBeFocused();
      expect(
        await prisma.task.findUnique({ where: { id: task.id } }),
      ).not.toBeNull();

      await openDeleteDialog(page);
      let deleteRequests = 0;
      const apiResponses: Array<{ status: number; bodyLength: number }> = [];
      const gate = new Promise<void>((resolve) =>
        releaseResponses.push(resolve),
      );
      await page.route(apiUrl, async (route) => {
        if (route.request().method() !== 'DELETE') return route.continue();
        deleteRequests += 1;
        const response = await route.fetch();
        // 一覧への遷移後はブラウザから本文を読めないため、中継前の実API応答を確認する。
        apiResponses.push({
          status: response.status(),
          bodyLength: (await response.body()).length,
        });
        await gate;
        await route.fulfill({ response });
      });

      await dialog.getByRole('button', { name: '削除', exact: true }).click();
      await expect.poll(() => deleteRequests).toBe(1);
      await expect(
        dialog.getByRole('button', { name: '削除中...' }),
      ).toBeDisabled();
      await expect(
        dialog.getByRole('button', { name: 'キャンセル' }),
      ).toBeDisabled();
      await expect(
        dialog.getByRole('button', { name: '閉じる' }),
      ).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole('button', { name: '削除中...' })
        .dispatchEvent('click');
      expect(deleteRequests).toBe(1);

      const responsePromise = page.waitForResponse(
        (response) =>
          response.url() === apiUrl && response.request().method() === 'DELETE',
      );
      releaseResponses.forEach((release) => release());
      const response = await responsePromise;
      expect(response.status()).toBe(204);
      expect(apiResponses).toEqual([{ status: 204, bodyLength: 0 }]);
      await expect(page).toHaveURL(`http://localhost:3100${tasksPath}`);
      await expect(
        list.getByRole('link', { name: task.title, exact: true }),
      ).toHaveCount(0);
      await expect(
        list.getByRole('link', { name: '削除確認タスク 3', exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        list.getByRole('link', { name: task.title, exact: true }),
      ).toHaveCount(0);
      expect(
        await prisma.task.findUnique({ where: { id: task.id } }),
      ).toBeNull();
      expect(
        await prisma.task.findMany({
          where: { projectId: project.id },
          orderBy: { number: 'asc' },
          select: { number: true },
        }),
      ).toEqual(
        viewport.number === 1
          ? [{ number: 2 }, { number: 3 }]
          : [{ number: 3 }],
      );
      expect(
        (await prisma.project.findUniqueOrThrow({ where: { id: project.id } }))
          .lastTaskNumber,
      ).toBe(3);
      await page.unroute(apiUrl);
    }
  } finally {
    releaseResponses.forEach((release) => release());
    try {
      await page.context().close();
    } finally {
      try {
        // 今回作ったProjectのTaskだけを片付け、Project・Userはfixtureに任せる。
        await prisma.task.deleteMany({
          where: {
            projectId: { in: projectIds },
            project: { ownerId: testUser.id },
          },
        });
      } finally {
        await prisma.$disconnect();
      }
    }
  }
});

test('通信失敗時はDialogとTaskを保持し、再試行で削除できる', async ({
  page,
  testUser,
}) => {
  test.setTimeout(60_000);
  const environment = validateBrowserE2EEnvironment();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
  });
  const projectIds: string[] = [];

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    const project = await prepareTasks(page, prisma, testUser);
    projectIds.push(project.id);
    const task = project.tasks.find(({ number }) => number === 1);
    if (!task) throw new Error('テスト用Taskが見つかりません');
    const tasksPath = `/projects/${project.id}/tasks`;
    const apiUrl = `${environment.apiUrl}/api/projects/${project.id}/tasks/${task.id}`;
    let deleteRequests = 0;

    await page.goto(`${tasksPath}/${task.id}`);
    const dialog = await openDeleteDialog(page);
    await page.route(apiUrl, async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue();
      deleteRequests += 1;
      if (deleteRequests === 1) return route.abort('internetdisconnected');
      return route.continue();
    });

    await dialog.getByRole('button', { name: '削除', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText(
      '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
    );
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: '削除', exact: true }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole('button', { name: 'キャンセル' }),
    ).toBeEnabled();
    expect(
      await prisma.task.findUnique({ where: { id: task.id } }),
    ).not.toBeNull();

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url() === apiUrl && response.request().method() === 'DELETE',
    );
    await dialog.getByRole('button', { name: '削除', exact: true }).click();
    expect((await responsePromise).status()).toBe(204);
    await expect(page).toHaveURL(`http://localhost:3100${tasksPath}`);
    expect(deleteRequests).toBe(2);
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(
      2,
    );
  } finally {
    try {
      await page.context().close();
    } finally {
      try {
        await prisma.task.deleteMany({
          where: {
            projectId: { in: projectIds },
            project: { ownerId: testUser.id },
          },
        });
      } finally {
        await prisma.$disconnect();
      }
    }
  }
});
