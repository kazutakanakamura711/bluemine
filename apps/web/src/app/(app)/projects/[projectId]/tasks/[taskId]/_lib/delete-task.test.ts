// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteTask, DeleteTaskRequestError } from './delete-task';

// セッション取得とHTTP通信をモックし、実際のTaskは削除しない。
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: mocks.createClient }));

const fetchMock = vi.fn<typeof fetch>();
const projectId = 'project-1';
const taskId = 'task-1';

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
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('deleteTask', () => {
  it('Bearer token付きで本文なしのDELETEを送り、204の本文を読まずに正常終了する', async () => {
    const response = new Response(null, { status: 204 });
    const jsonSpy = vi.spyOn(response, 'json');
    fetchMock.mockResolvedValue(response);

    await expect(deleteTask(projectId, taskId)).resolves.toBeUndefined();

    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'http://localhost:3001/api/projects/project-1/tasks/task-1',
      {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test-access-token' },
      },
    );
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('両方のIDの予約文字をそれぞれパス要素としてエンコードする', async () => {
    await deleteTask(
      'project/with spaces?tab=tasks',
      'task/with spaces#detail',
    );

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      'http://localhost:3001/api/projects/project%2Fwith%20spaces%3Ftab%3Dtasks/tasks/task%2Fwith%20spaces%23detail',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it.each([
    { data: { session: null }, error: null },
    {
      data: { session: { access_token: 'test-access-token' } },
      error: new Error('Session read failed'),
    },
  ])('セッションを取得できなければDELETEを送らない', async (session) => {
    mocks.getSession.mockResolvedValue(session);

    await expect(deleteTask(projectId, taskId)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得自体が失敗した場合はエラーを伝え、DELETEを送らない', async () => {
    const error = new TypeError('Failed to fetch');
    mocks.getSession.mockRejectedValue(error);

    await expect(deleteTask(projectId, taskId)).rejects.toBe(error);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 同じstatusでも、ProjectとTaskのどちらが見つからないかをAPIのメッセージで伝える。
  it.each([
    { status: 401, message: 'Unauthorized' },
    { status: 403, message: '確認済みのメールアドレスが必要です。' },
    { status: 403, message: 'タスクを削除する権限がありません' },
    { status: 404, message: 'プロジェクトが見つかりません' },
    { status: 404, message: 'タスクが見つかりません' },
    {
      status: 409,
      message: 'アーカイブ済みのプロジェクトはタスクを削除できません',
    },
  ])(
    '$statusの失敗はAPIの理由とstatusを保持する',
    async ({ status, message }) => {
      fetchMock.mockResolvedValue(Response.json({ message }, { status }));

      const request = deleteTask(projectId, taskId);

      await expect(request).rejects.toBeInstanceOf(DeleteTaskRequestError);
      await expect(request).rejects.toMatchObject({
        statusCode: status,
        message,
      });
    },
  );

  it.each([
    {
      description: 'messageが配列',
      body: JSON.stringify({ message: ['error'] }),
    },
    { description: 'JSONではない', body: 'Internal Server Error' },
    { description: '空', body: null },
  ])('$description場合は汎用メッセージとstatusを伝える', async ({ body }) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 500 }));

    const request = deleteTask(projectId, taskId);

    await expect(request).rejects.toBeInstanceOf(DeleteTaskRequestError);
    await expect(request).rejects.toMatchObject({
      statusCode: 500,
      message: 'タスクの削除に失敗しました。',
    });
  });

  it('通信エラーをそのまま伝え、自動でDELETEを繰り返さない', async () => {
    const error = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(error);

    await expect(deleteTask(projectId, taskId)).rejects.toBe(error);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('APIのURLが未設定なら、セッション取得とDELETEを行わない', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(deleteTask(projectId, taskId)).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL が設定されていません。',
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
