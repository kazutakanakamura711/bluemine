// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getProjects } from './get-projects';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  createClient: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: mocks.connection }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

const fetchMock = vi.fn<typeof fetch>();

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
  fetchMock.mockResolvedValue(Response.json([]));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getProjects の認証付き一覧取得', () => {
  it('サーバー用クライアントでセッションを取得し、Bearer token を付けて一覧を取得する', async () => {
    await expect(getProjects()).resolves.toEqual([]);

    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects',
      {
        headers: {
          Authorization: 'Bearer test-access-token',
        },
        cache: 'no-store',
      },
    );
  });

  it('セッションがない場合は、一覧 API を呼ばずにエラーを投げる', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(getProjects()).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得が失敗した場合は、一覧 API を呼ばずにエラーを投げる', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Session read failed'),
    });

    await expect(getProjects()).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得が成功しても、一覧 API の 401 を成功として扱わない', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(getProjects()).rejects.toThrow(
      'プロジェクト一覧の取得に失敗しました。',
    );
  });

  it('API の URL が未設定の場合は、セッション取得と API 呼び出しを行わない', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(getProjects()).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL が設定されていません。',
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
