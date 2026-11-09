import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../apps/api/src/generated/prisma/client.js';
import { validateBrowserE2EEnvironment } from '../environment.mjs';
import { expect, test } from '../fixtures/test-user.js';

test('担当者のプルダウンで未担当を選び、失敗後に再試行できる', async ({
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
        name: '担当者行内編集確認',
        key: `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        ownerId: testUser.id,
        projectMembers: { create: { userId: testUser.id, role: 'owner' } },
        tasks: {
          create: {
            number: 1,
            title: '担当者を変更するタスク',
            assigneeId: testUser.id,
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
          json: { message: 'テスト用の担当者更新失敗です' },
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
          status: task.status,
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
    const assigneeSelect = page.getByRole('combobox', {
      name: '担当者',
      exact: true,
    });
    await expect(assigneeSelect).toContainText(testUser.name);
    await assigneeSelect.click();
    await expect(
      page.getByRole('option', { name: '未担当', exact: true }),
    ).toBeVisible();
    await page.getByRole('option', { name: '未担当', exact: true }).click();

    await expect.poll(() => patchCount).toBe(1);
    await expect(assigneeSelect).toBeDisabled();
    await expect(page.getByRole('status')).toHaveText('保存中...');
    await expect(assigneeSelect).toContainText(testUser.name);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
        .assigneeId,
    ).toBe(testUser.id);

    releaseResponse();
    await expect(
      page.getByText('テスト用の担当者更新失敗です', { exact: true }),
    ).toBeVisible();
    await expect(assigneeSelect).toBeEnabled();
    await expect(assigneeSelect).toContainText(testUser.name);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
        .assigneeId,
    ).toBe(testUser.id);

    await assigneeSelect.click();
    await page.getByRole('option', { name: '未担当', exact: true }).click();
    await expect.poll(() => patchCount).toBe(2);
    await expect(assigneeSelect).toContainText('未担当');
    await expect(
      page.getByText('担当者を未担当に変更しました', { exact: true }),
    ).toBeVisible();
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
        .assigneeId,
    ).toBe(testUser.id);
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

test('実APIで担当者の設定と解除を保存し、再読み込み後も反映する', async ({
  page,
  testUser,
}) => {
  const environment = validateBrowserE2EEnvironment();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: environment.databaseUrl }),
  });
  let projectId: string | undefined;

  try {
    await page.goto('/login');
    await page.getByLabel(/^メールアドレス\s*\*?$/).fill(testUser.email);
    await page.getByLabel(/^パスワード\s*\*?$/).fill(testUser.password);
    await page.getByRole('button', { name: 'ログイン', exact: true }).click();
    await expect(page).toHaveURL(`${environment.webUrl}/projects`);

    const project = await prisma.project.create({
      data: {
        name: '担当者の保存確認',
        key: `PW${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        ownerId: testUser.id,
        lastTaskNumber: 1,
        projectMembers: { create: { userId: testUser.id, role: 'owner' } },
        tasks: {
          create: {
            number: 1,
            title: '担当者の保存を確認するタスク',
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
    await page.goto(`/projects/${project.id}/tasks/${task.id}`);
    const assigneeSelect = page.getByRole('combobox', {
      name: '担当者',
      exact: true,
    });
    await expect(assigneeSelect).toContainText('未担当');
    await assigneeSelect.click();
    const assignResponse = page.waitForResponse(
      (response) =>
        response.url() === apiUrl && response.request().method() === 'PATCH',
    );
    await page
      .getByRole('option', { name: testUser.name, exact: true })
      .click();
    const assigned = await assignResponse;
    expect(assigned.status()).toBe(200);
    expect(assigned.request().postDataJSON()).toEqual({
      assigneeId: testUser.id,
    });
    await expect(assigneeSelect).toContainText(testUser.name);
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
        .assigneeId,
    ).toBe(testUser.id);
    await page.reload();
    await expect(assigneeSelect).toContainText(testUser.name);

    await assigneeSelect.click();
    const unassignResponse = page.waitForResponse(
      (response) =>
        response.url() === apiUrl && response.request().method() === 'PATCH',
    );
    await page.getByRole('option', { name: '未担当', exact: true }).click();
    const unassigned = await unassignResponse;
    expect(unassigned.status()).toBe(200);
    expect(unassigned.request().postDataJSON()).toEqual({ assigneeId: null });
    await expect(assigneeSelect).toContainText('未担当');
    expect(
      (await prisma.task.findUniqueOrThrow({ where: { id: task.id } }))
        .assigneeId,
    ).toBeNull();
    await page.reload();
    await expect(assigneeSelect).toContainText('未担当');
  } finally {
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
