// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '@/features/tasks/types/task';
import { getTask } from './get-task';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  createClient: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));

const fetchMock = vi.fn<typeof fetch>();
const task: Task = {
  id: 'task-1',
  projectId: 'project-1',
  number: 12,
  assignee: null,
  reporter: { id: 'reporter-1', name: null },
  title: 'タスク詳細を取得する',
  description: null,
  status: 'todo',
  priority: 'normal',
  startDate: '2026-10-29',
  dueDate: null,
  createdAt: '2026-10-29T00:00:00.000Z',
  updatedAt: '2026-10-29T00:00:00.000Z',
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api');
  vi.stubGlobal('fetch', fetchMock);
  mocks.createClient.mockResolvedValue({
    auth: { getSession: mocks.getSession },
  });
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: 'test-access-token' } },
    error: null,
  });
  fetchMock.mockResolvedValue(Response.json(task));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getTask', () => {
  it('Bearer tokenを付けてProject・Taskの両IDで取得し、nullや日付を含む応答をそのまま返す', async () => {
    await expect(getTask(task.projectId, task.id)).resolves.toEqual(task);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'http://localhost:3001/api/projects/project-1/tasks/task-1',
      {
        headers: { Authorization: 'Bearer test-access-token' },
        cache: 'no-store',
      },
    );
  });

  it('URLの各IDをエンコードして、別のパスやqueryとして解釈させない', async () => {
    await getTask('project/1?x=y', 'task/1#detail');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project%2F1%3Fx%3Dy/tasks/task%2F1%23detail',
      expect.any(Object),
    );
  });

  it('404はページでnotFoundを呼べるようnullを返す', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(getTask(task.projectId, task.id)).resolves.toBeNull();
  });

  it.each([401, 403, 500])(
    '%sは404と区別し、エラーとして伝える',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      await expect(getTask(task.projectId, task.id)).rejects.toThrow(
        'タスク詳細の取得に失敗しました。',
      );
    },
  );

  it('セッションがなければAPIを呼ばない', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(getTask(task.projectId, task.id)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得エラーがあれば、tokenが返っていてもAPIを呼ばない', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: new Error('Session read failed'),
    });

    await expect(getTask(task.projectId, task.id)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('API URLが未設定ならセッション取得とAPI呼び出しを行わない', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(getTask(task.projectId, task.id)).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL が設定されていません。',
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('通信失敗は呼び出し側へ伝える', async () => {
    const error = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(error);

    await expect(getTask(task.projectId, task.id)).rejects.toBe(error);
  });
});
