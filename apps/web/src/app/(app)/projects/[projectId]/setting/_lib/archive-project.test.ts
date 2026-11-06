// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { archiveProject } from './archive-project';

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

describe('archiveProject の認証付きアーカイブ', () => {
  it('ブラウザ用クライアントでセッションを取得し、Bearer token を付けて本文なしで POST する', async () => {
    await expect(archiveProject(projectId)).resolves.toBeUndefined();

    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project-1/archive',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-access-token',
        },
      },
    );
  });

  it('セッションがない場合は、アーカイブ API を呼ばずにエラーを投げる', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(archiveProject(projectId)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得にエラーがある場合は、セッションが返っていてもアーカイブ API を呼ばない', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: new Error('Session read failed'),
    });

    await expect(archiveProject(projectId)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得の通信が失敗した場合は、アーカイブ API を呼ばずエラーを伝える', async () => {
    const sessionError = new TypeError('Failed to fetch');
    mocks.getSession.mockRejectedValue(sessionError);

    await expect(archiveProject(projectId)).rejects.toBe(sessionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404])(
    'セッションがあっても、アーカイブ API の %s を成功として扱わず statusCode を伝える',
    async (status) => {
      fetchMock.mockResolvedValue(
        Response.json(
          { message: 'プロジェクトをアーカイブできませんでした。' },
          { status },
        ),
      );

      const request = archiveProject(projectId);

      await expect(request).rejects.toBeInstanceOf(ProjectRequestError);
      await expect(request).rejects.toMatchObject({
        statusCode: status,
        message: 'プロジェクトをアーカイブできませんでした。',
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

    const request = archiveProject(projectId);

    await expect(request).rejects.toBeInstanceOf(ProjectRequestError);
    await expect(request).rejects.toMatchObject({
      statusCode: 500,
      message: 'プロジェクトのアーカイブに失敗しました。',
    });
  });

  it('API の URL が未設定の場合は、セッション取得と API 呼び出しを行わない', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(archiveProject(projectId)).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL が設定されていません。',
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
