import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Page } from '@playwright/test';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { validateBrowserE2EEnvironment } from '../environment.mjs';
import { expect, test } from '../fixtures/test-user.js';

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel(/^メールアドレス\s*\*?$/).fill(user.email);
  await page.getByLabel(/^パスワード\s*\*?$/).fill(user.password);
  await page.getByRole('button', { name: 'ログイン', exact: true }).click();
  await expect(page).toHaveURL('http://localhost:3100/projects');
}

async function selectDate(page: Page, label: string, day: number) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const popup = page.getByRole('dialog', {
    name: `${label}を選択`,
    exact: true,
  });
  const { year, month } = await page.evaluate(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  }));
  await popup
    .getByRole('button', { name: new RegExp(`${year}年${month}月${day}日`) })
    .click();
  await expect(popup).toBeHidden();
}

test('PC・モバイルで作成し、送信中の二重登録を防いで詳細・再読み込み・一覧へ進める', async ({
  page,
  testUser,
}, testInfo) => {
  const environment = validateBrowserE2EEnvironment();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
  });
  let releaseResponse = () => {};
  try {
    await login(page, testUser);
    const project = await prisma.project.create({
      data: {
        name: 'タスク作成確認',
        key: `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        ownerId: testUser.id,
        projectMembers: { create: { userId: testUser.id, role: 'owner' } },
      },
    });
    const tasksPath = `/projects/${project.id}/tasks`;
    const apiUrl = `${environment.apiUrl}/api/projects/${project.id}/tasks`;
    let createdCount = 0;
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(tasksPath);
      await page.getByRole('link', { name: 'タスク作成', exact: true }).click();
      await expect(page).toHaveURL(`${environment.webUrl}${tasksPath}/new`);
      const button = page.getByRole('button', {
        name: 'タスクを作成',
        exact: true,
      });
      await page
        .getByRole('textbox', { name: 'タイトル', exact: true })
        .focus();
      await page.getByRole('textbox', { name: '説明', exact: true }).click();
      await expect(
        page
          .getByRole('form', { name: 'タスク作成フォーム', exact: true })
          .getByRole('alert'),
      ).toHaveCount(0);
      await button.click();
      await expect(
        page
          .getByRole('form', { name: 'タスク作成フォーム', exact: true })
          .getByRole('alert'),
      ).toHaveText('タイトルは必須です');
      const title = `ブラウザから作成 ${width}`;
      await page
        .getByRole('textbox', { name: 'タイトル', exact: true })
        .fill(`  ${title}  `);
      await page
        .getByRole('textbox', { name: '説明', exact: true })
        .fill('  入力内容を保存します。  ');
      for (const [label, option] of [
        ['ステータス', '進行中'],
        ['優先度', '高'],
        ['担当者', testUser.name],
      ]) {
        await page.getByRole('combobox', { name: label, exact: true }).click();
        const item = page.getByRole('option', { name: option, exact: true });
        await item.click();
        await expect(item).toBeHidden();
      }
      await selectDate(page, '開始日', 15);
      await selectDate(page, '期限', 14);
      await expect(
        page
          .getByRole('form', { name: 'タスク作成フォーム', exact: true })
          .getByRole('alert'),
      ).toHaveText('期限は開始日以降の日付を指定してください');
      await button.click();
      expect(
        await prisma.task.count({ where: { projectId: project.id } }),
      ).toBe(createdCount);
      await selectDate(page, '期限', 20);
      await expect(
        page
          .getByRole('form', { name: 'タスク作成フォーム', exact: true })
          .getByRole('alert'),
      ).toHaveCount(0);
      await page
        .getByRole('spinbutton', { name: '予定工数（時間）', exact: true })
        .fill('4.5');

      let posts = 0;
      let payload: unknown;
      const gate = new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
      await page.route(apiUrl, async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        posts += 1;
        payload = route.request().postDataJSON();
        // 実際のAPIへ保存し、応答だけを保留して送信中の表示を確認する。
        const response = await route.fetch();
        await gate;
        await route.fulfill({ response });
      });
      await button.click();
      await expect.poll(() => posts).toBe(1);
      await expect(
        page.getByRole('button', { name: '作成中...', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('textbox', { name: 'タイトル', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('combobox', { name: '担当者', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: '期限', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'キャンセル', exact: true }),
      ).toBeDisabled();
      await page
        .getByRole('form', { name: 'タスク作成フォーム', exact: true })
        .dispatchEvent('submit');
      expect(posts).toBe(1);
      await page.screenshot({
        path: testInfo.outputPath(`task-submitting-${width}.png`),
        fullPage: true,
      });
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url() === apiUrl && response.request().method() === 'POST',
      );
      releaseResponse();
      const response = await responsePromise;
      expect(response.status()).toBe(201);
      const task = await response.json();
      createdCount += 1;
      await expect(page).toHaveURL(
        `${environment.webUrl}${tasksPath}/${task.id}`,
      );
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: `${project.key}-${createdCount}`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      const datePrefix = await page.evaluate(
        () =>
          `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      );
      expect(payload).toEqual({
        title,
        description: '入力内容を保存します。',
        status: 'in_progress',
        priority: 'high',
        assigneeId: testUser.id,
        startDate: `${datePrefix}-15`,
        dueDate: `${datePrefix}-20`,
      });
      const saved = await prisma.task.findUniqueOrThrow({
        where: { id: task.id },
      });
      expect(saved.number).toBe(createdCount);
      expect(saved.reporterId).toBe(testUser.id);
      expect(saved.assigneeId).toBe(testUser.id);
      expect(saved.startDate?.toISOString().slice(0, 10)).toBe(
        `${datePrefix}-15`,
      );
      expect(saved.dueDate?.toISOString().slice(0, 10)).toBe(
        `${datePrefix}-20`,
      );
      expect(
        (await prisma.project.findUniqueOrThrow({ where: { id: project.id } }))
          .lastTaskNumber,
      ).toBe(createdCount);
      await page.reload();
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await page
        .getByRole('navigation', { name: 'パンくずリスト', exact: true })
        .getByRole('link', { name: project.name, exact: true })
        .click();
      await expect(page).toHaveURL(`${environment.webUrl}${tasksPath}`);
      await expect(
        page.getByRole('link', { name: title, exact: true }),
      ).toBeVisible();
      expect(posts).toBe(1);
      expect(
        await prisma.task.count({ where: { projectId: project.id } }),
      ).toBe(createdCount);
      await page.unroute(apiUrl);
    }
  } finally {
    releaseResponse();
    try {
      await page.context().close();
    } finally {
      try {
        await prisma.task.deleteMany({
          where: { project: { ownerId: testUser.id } },
        });
      } finally {
        await prisma.$disconnect();
      }
    }
  }
});

test('APIエラーで入力を保持し、修正せず再試行して1件だけ作成できる', async ({
  page,
  testUser,
}, testInfo) => {
  const environment = validateBrowserE2EEnvironment();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
  });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, testUser);
    const project = await prisma.project.create({
      data: {
        name: '再試行確認',
        key: `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        ownerId: testUser.id,
        projectMembers: { create: { userId: testUser.id, role: 'owner' } },
      },
    });
    const tasksPath = `/projects/${project.id}/tasks`;
    const apiUrl = `${environment.apiUrl}/api/projects/${project.id}/tasks`;
    let posts = 0;
    await page.route(apiUrl, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      posts += 1;
      if (posts === 1)
        return route.fulfill({
          status: 409,
          headers: { 'Access-Control-Allow-Origin': environment.webUrl },
          json: { message: 'タスク番号が競合しました' },
        });
      return route.continue();
    });
    await page.goto(`${tasksPath}/new`);
    const title = page.getByRole('textbox', { name: 'タイトル', exact: true });
    await title.fill('再試行したタスク');
    await page
      .getByRole('button', { name: 'タスクを作成', exact: true })
      .click();
    await expect(
      page
        .getByRole('form', { name: 'タスク作成フォーム', exact: true })
        .getByRole('alert'),
    ).toHaveText('タスク番号が競合しました');
    await expect(title).toHaveValue('再試行したタスク');
    await expect(page).toHaveURL(`${environment.webUrl}${tasksPath}/new`);
    expect(await prisma.task.count({ where: { projectId: project.id } })).toBe(
      0,
    );
    await page.screenshot({
      path: testInfo.outputPath('task-submit-error-mobile.png'),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'タスクを作成', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${tasksPath}/[^/]+$`));
    await expect(
      page.getByRole('heading', { name: '再試行したタスク', exact: true }),
    ).toBeVisible();
    expect(posts).toBe(2);
    const tasks = await prisma.task.findMany({
      where: { projectId: project.id },
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      number: 1,
      reporterId: testUser.id,
      assigneeId: null,
      description: null,
      startDate: null,
      dueDate: null,
    });
  } finally {
    try {
      await page.context().close();
    } finally {
      try {
        await prisma.task.deleteMany({
          where: { project: { ownerId: testUser.id } },
        });
      } finally {
        await prisma.$disconnect();
      }
    }
  }
});
