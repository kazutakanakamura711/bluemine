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
  name: string;
};

// 認証と対象データは、このテスト専用の環境・ユーザーに限定する。
async function prepareTasks(page: Page, prisma: PrismaClient, user: TestUser) {
  await page.goto('/login');
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(user.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(user.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3100/projects');

  return prisma.project.create({
    data: {
      name: 'タスク編集確認',
      key: `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      ownerId: user.id,
      lastTaskNumber: 2,
      projectMembers: { create: { userId: user.id, role: 'owner' } },
      tasks: {
        create: [1, 2].map((number) => ({
          number,
          title: `編集前のタスク ${number}`,
          description: '保持する説明',
          status: 'in_progress' as const,
          priority: 'high' as const,
          assigneeId: user.id,
          reporterId: user.id,
          startDate: new Date('2026-10-15T00:00:00.000Z'),
          dueDate: new Date('2026-10-20T00:00:00.000Z'),
        })),
      },
    },
    include: { tasks: true },
  });
}

async function openEditSheet(page: Page) {
  await page.getByRole('button', { name: '編集', exact: true }).click();
  const sheet = page.getByRole('dialog', {
    name: 'タスクを編集',
    exact: true,
  });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('PC・モバイルで差分だけを保存し、担当者と日付の変更・解除を再読み込み後も保持する', async ({
  page,
  testUser,
}) => {
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

    for (const viewport of [
      { width: 1280, height: 900, number: 1 },
      { width: 390, height: 844, number: 2 },
    ]) {
      const task = project.tasks.find(
        ({ number }) => number === viewport.number,
      );
      expect(task).toBeDefined();
      if (!task) throw new Error('テスト用Taskが見つかりません');
      const detailPath = `/projects/${project.id}/tasks/${task.id}`;
      const apiUrl = `${environment.apiUrl}/api/projects/${project.id}/tasks/${task.id}`;
      const title = `ブラウザから編集 ${viewport.width}`;
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(detailPath);
      const sheet = await openEditSheet(page);
      await sheet
        .getByRole('textbox', { name: 'タイトル', exact: true })
        .fill(title);

      // 実APIの応答を保留し、保存中の二重送信とSheetの閉鎖を確認する。
      const payloads: unknown[] = [];
      const gate = new Promise<void>((resolve) =>
        releaseResponses.push(resolve),
      );
      await page.route(apiUrl, async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue();
        payloads.push(route.request().postDataJSON());
        const response = await route.fetch();
        await gate;
        await route.fulfill({ response });
      });
      await sheet
        .getByRole('button', { name: '変更を保存', exact: true })
        .click();
      await expect.poll(() => payloads.length).toBe(1);
      await expect(
        sheet.getByRole('textbox', { name: 'タイトル' }),
      ).toBeDisabled();
      await expect(
        sheet.getByRole('button', { name: '変更を保存' }),
      ).toBeDisabled();
      await expect(
        sheet.getByRole('button', { name: 'キャンセル' }),
      ).toBeDisabled();
      await expect(
        sheet.getByRole('button', { name: 'タスク編集を閉じる' }),
      ).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(sheet).toBeVisible();
      if (viewport.width === 1280) {
        await page.mouse.click(10, 200);
        await expect(sheet).toBeVisible();
      }
      await sheet
        .getByRole('form', { name: 'タスク編集フォーム' })
        .dispatchEvent('submit');
      await expect.poll(() => payloads.length).toBe(1);

      const titleResponse = page.waitForResponse(
        (response) =>
          response.url() === apiUrl && response.request().method() === 'PATCH',
      );
      releaseResponses.forEach((release) => release());
      expect((await titleResponse).status()).toBe(200);
      expect(payloads).toEqual([{ title }]);
      await expect(sheet).toBeHidden();
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await page.unroute(apiUrl);
      await page.reload();
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();

      // 担当解除と期限の変更だけを送信する。
      const firstEdit = await openEditSheet(page);
      await firstEdit
        .getByRole('combobox', { name: '担当者', exact: true })
        .click();
      await page.getByRole('option', { name: '未担当', exact: true }).click();
      await firstEdit
        .getByRole('button', { name: '期限', exact: true })
        .click();
      const calendar = page.getByRole('dialog', {
        name: '期限を選択',
        exact: true,
      });
      await calendar.getByRole('button', { name: /2026年10月25日/ }).click();
      await expect(calendar).toBeHidden();
      const updateResponse = page.waitForResponse(
        (response) =>
          response.url() === apiUrl && response.request().method() === 'PATCH',
      );
      await firstEdit
        .getByRole('button', { name: '変更を保存', exact: true })
        .click();
      const updated = await updateResponse;
      expect(updated.status()).toBe(200);
      expect(updated.request().postDataJSON()).toEqual({
        assigneeId: null,
        dueDate: '2026-10-25',
      });
      await expect(firstEdit).toBeHidden();
      const properties = page.getByRole('complementary', {
        name: '属性',
        exact: true,
      });
      await expect(
        properties.getByText('未担当', { exact: true }),
      ).toBeVisible();
      await expect(
        properties.getByText('2026/10/25', { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        properties.getByText('未担当', { exact: true }),
      ).toBeVisible();
      await expect(
        properties.getByText('2026/10/25', { exact: true }),
      ).toBeVisible();

      // 担当者を再設定し、期限を解除する。
      const secondEdit = await openEditSheet(page);
      await secondEdit
        .getByRole('combobox', { name: '担当者', exact: true })
        .click();
      await page
        .getByRole('option', { name: testUser.name, exact: true })
        .click();
      await secondEdit
        .getByRole('button', { name: '期限', exact: true })
        .click();
      const clearCalendar = page.getByRole('dialog', {
        name: '期限を選択',
        exact: true,
      });
      await clearCalendar
        .getByRole('button', { name: '期限をクリア', exact: true })
        .click();
      await expect(clearCalendar).toBeHidden();
      const clearResponse = page.waitForResponse(
        (response) =>
          response.url() === apiUrl && response.request().method() === 'PATCH',
      );
      await secondEdit
        .getByRole('button', { name: '変更を保存', exact: true })
        .click();
      const cleared = await clearResponse;
      expect(cleared.status()).toBe(200);
      expect(cleared.request().postDataJSON()).toEqual({
        assigneeId: testUser.id,
        dueDate: null,
      });
      await expect(secondEdit).toBeHidden();
      await expect(
        properties.getByText('未設定', { exact: true }),
      ).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await expect(
        properties.getByText('未設定', { exact: true }),
      ).toBeVisible();
      await expect(
        properties.getByText(testUser.name, { exact: true }),
      ).toHaveCount(2);

      // 指定しなかった番号・報告者などが維持されていることもDBで確認する。
      const saved = await prisma.task.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(saved).toMatchObject({
        projectId: project.id,
        number: viewport.number,
        title,
        description: '保持する説明',
        status: 'in_progress',
        priority: 'high',
        assigneeId: testUser.id,
        reporterId: testUser.id,
        dueDate: null,
      });
      expect(saved.startDate?.toISOString().slice(0, 10)).toBe('2026-10-15');
    }
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: project.id } }))
        .lastTaskNumber,
    ).toBe(2);
  } finally {
    releaseResponses.forEach((release) => release());
    try {
      await page.context().close();
    } finally {
      try {
        // 今回作ったProjectだけのTaskを削除し、Project・Userの後片付けはfixtureに任せる。
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

test('通信失敗後も編集内容を保持し、同じ入力で再試行できる', async ({
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
    expect(task).toBeDefined();
    if (!task) throw new Error('テスト用Taskが見つかりません');
    const apiUrl = `${environment.apiUrl}/api/projects/${project.id}/tasks/${task.id}`;
    const payloads: unknown[] = [];

    await page.goto(`/projects/${project.id}/tasks/${task.id}`);
    const sheet = await openEditSheet(page);
    const title = sheet.getByRole('textbox', { name: 'タイトル', exact: true });
    await title.fill('再試行したタスク');
    await page.route(apiUrl, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      payloads.push(route.request().postDataJSON());
      // 最初のPATCHだけ通信失敗にし、再試行は実APIへ送る。
      if (payloads.length === 1) return route.abort('internetdisconnected');
      return route.continue();
    });

    await sheet
      .getByRole('button', { name: '変更を保存', exact: true })
      .click();
    await expect(sheet.getByRole('alert')).toHaveText(
      'タスクの更新に失敗しました。時間をおいて、もう一度お試しください。',
    );
    await expect(sheet).toBeVisible();
    await expect(title).toHaveValue('再試行したタスク');
    await expect(title).toBeEnabled();
    await expect(
      sheet.getByRole('button', { name: 'キャンセル' }),
    ).toBeEnabled();
    await expect(
      sheet.getByRole('button', { name: 'タスク編集を閉じる' }),
    ).toBeEnabled();
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title,
    ).toBe(task.title);

    const retryResponse = page.waitForResponse(
      (response) =>
        response.url() === apiUrl && response.request().method() === 'PATCH',
    );
    await sheet
      .getByRole('button', { name: '変更を保存', exact: true })
      .click();
    expect((await retryResponse).status()).toBe(200);
    expect(payloads).toEqual([
      { title: '再試行したタスク' },
      { title: '再試行したタスク' },
    ]);
    await expect(sheet).toBeHidden();
    await expect(
      page.getByRole('heading', { name: '再試行したタスク', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: '再試行したタスク', exact: true }),
    ).toBeVisible();
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title,
    ).toBe('再試行したタスク');
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
