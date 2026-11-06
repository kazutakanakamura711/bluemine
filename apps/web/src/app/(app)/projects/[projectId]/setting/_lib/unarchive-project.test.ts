// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { unarchiveProject } from './unarchive-project';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: mocks.createClient,
}));

const fetchMock = vi.fn<typeof fetch>();
const projectId = 'project-1';

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
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('unarchiveProject の認証付きアーカイブ解除', () => {
  it('ブラウザ用クライアントでセッションを取得し、Bearer token を付けて本文なしで解除 API に POST する', async () => {
    await expect(unarchiveProject(projectId)).resolves.toBeUndefined();

    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project-1/unarchive',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-access-token',
        },
      },
    );
  });

  it('セッションがない場合は、解除 API を呼ばずにエラーを投げる', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(unarchiveProject(projectId)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得にエラーがある場合は、セッションが返っていても解除 API を呼ばない', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: new Error('Session read failed'),
    });

    await expect(unarchiveProject(projectId)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得の通信が失敗した場合は、解除 API を呼ばずエラーを伝える', async () => {
    const sessionError = new TypeError('Failed to fetch');
    mocks.getSession.mockRejectedValue(sessionError);

    await expect(unarchiveProject(projectId)).rejects.toBe(sessionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404])(
    'セッションがあっても、解除 API の %s を成功として扱わず statusCode を伝える',
    async (status) => {
      fetchMock.mockResolvedValue(
        Response.json(
          { message: 'プロジェクトのアーカイブを解除できませんでした。' },
          { status },
        ),
      );

      const request = unarchiveProject(projectId);

      await expect(request).rejects.toBeInstanceOf(ProjectRequestError);
      await expect(request).rejects.toMatchObject({
        statusCode: status,
        message: 'プロジェクトのアーカイブを解除できませんでした。',
      });
    },
  );

  it('API のエラー本文が JSON でない場合は、汎用メッセージと statusCode を伝える', async () => {
    fetchMock.mockResolvedValue(
      new Response('Internal Server Error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const request = unarchiveProject(projectId);

    await expect(request).rejects.toBeInstanceOf(ProjectRequestError);
    await expect(request).rejects.toMatchObject({
      statusCode: 500,
      message: 'プロジェクトのアーカイブ解除に失敗しました。',
    });
  });

  it('API の URL が未設定の場合は、セッション取得と API 呼び出しを行わない', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(unarchiveProject(projectId)).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL が設定されていません。',
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
