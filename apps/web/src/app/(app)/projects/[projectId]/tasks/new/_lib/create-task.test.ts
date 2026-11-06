// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '@/features/tasks/types/task';
import { TaskPriority } from '@/features/tasks/types/task-priority';
import { TaskStatus } from '@/features/tasks/types/task-status';
import {
  createTask,
  CreateTaskRequestError,
  type CreateTaskInput,
} from './create-task';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }));

const fetchMock = vi.fn<typeof fetch>();
const projectId = 'project-1';
const input: CreateTaskInput = {
  title: 'ログイン画面を作る',
  description: 'メールアドレスとパスワードを入力する画面',
  status: TaskStatus.InProgress,
  priority: TaskPriority.High,
  assigneeId: 'user-2',
  startDate: '2026-10-31',
  dueDate: '2026-11-02',
};
const task: Task = {
  id: 'task-1',
  projectId,
  number: 3,
  title: input.title,
  description: input.description ?? null,
  status: TaskStatus.InProgress,
  priority: TaskPriority.High,
  assignee: { id: 'user-2', name: null },
  reporter: { id: 'user-1', name: '山田太郎' },
  startDate: '2026-10-31',
  dueDate: '2026-11-02',
  createdAt: '2026-10-31T00:00:00.000Z',
  updatedAt: '2026-10-31T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api');
  vi.stubGlobal('fetch', fetchMock);
  mocks.createClient.mockReturnValue({
    auth: { getSession: mocks.getSession },
  });
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: 'test-access-token' } },
    error: null,
  });
  fetchMock.mockResolvedValue(Response.json(task, { status: 201 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('createTask', () => {
  it('Bearer tokenと7項目の本文をPOSTし、番号・報告者を含む作成済みTaskを返す', async () => {
    await expect(createTask(projectId, input)).resolves.toEqual(task);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'http://localhost:3001/api/projects/project-1/tasks',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-access-token',
        },
        body: JSON.stringify(input),
      },
    );
  });

  it('任意項目は省略でき、APIが設定した初期値と未設定の値を返す', async () => {
    const created: Task = {
      ...task,
      description: null,
      status: TaskStatus.Todo,
      priority: TaskPriority.Normal,
      assignee: null,
      startDate: null,
      dueDate: null,
    };
    fetchMock.mockResolvedValue(Response.json(created, { status: 201 }));
    await expect(
      createTask(projectId, { title: input.title }),
    ).resolves.toEqual(created);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ title: input.title }) }),
    );
  });

  it('projectIdにURLの予約文字があっても、1つのパス要素としてエンコードする', async () => {
    await createTask('project/with spaces?tab=tasks#list', input);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project%2Fwith%20spaces%3Ftab%3Dtasks%23list/tasks',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    { data: { session: null }, error: null },
    {
      data: { session: { access_token: 'test-access-token' } },
      error: new Error('session failed'),
    },
  ])('セッションを取得できなければPOSTしない', async (session) => {
    mocks.getSession.mockResolvedValue(session);
    await expect(createTask(projectId, input)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      status: 400,
      message: '担当者は同じプロジェクトの参加者を指定してください',
    },
    { status: 401, message: 'Unauthorized' },
    { status: 403, message: 'タスクを作成する権限がありません' },
    { status: 404, message: 'プロジェクトが見つかりません' },
    {
      status: 409,
      message: 'アーカイブ済みのプロジェクトにはタスクを作成できません',
    },
    { status: 409, message: 'タスク番号が競合しました' },
  ])(
    '$statusの失敗は理由とHTTPステータスを保って伝える',
    async ({ status, message }) => {
      fetchMock.mockResolvedValue(Response.json({ message }, { status }));
      const request = createTask(projectId, input);
      await expect(request).rejects.toBeInstanceOf(CreateTaskRequestError);
      await expect(request).rejects.toMatchObject({
        statusCode: status,
        message,
      });
    },
  );

  it.each([
    {
      status: 400,
      body: JSON.stringify({ message: ['title should not be empty'] }),
    },
    { status: 500, body: 'Internal Server Error' },
    { status: 500, body: null },
  ])(
    '表示できるエラーメッセージがなければ、汎用メッセージとHTTPステータスを伝える',
    async ({ status, body }) => {
      fetchMock.mockResolvedValue(new Response(body, { status }));
      await expect(createTask(projectId, input)).rejects.toMatchObject({
        statusCode: status,
        message: 'タスクの作成に失敗しました。',
      });
    },
  );

  it('通信エラーをそのまま呼び出し元へ伝え、自動でPOSTを繰り返さない', async () => {
    const error = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(error);
    await expect(createTask(projectId, input)).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('APIのURLが未設定なら、セッション取得とPOSTを行わない', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');
    await expect(createTask(projectId, input)).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL が設定されていません。',
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
