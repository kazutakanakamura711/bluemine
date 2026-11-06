// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getProject, type ProjectDetail } from './get-project';
import { ProjectRole } from '@/features/projects/types/project-role';

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

const project: ProjectDetail = {
  id: 'project-1',
  key: 'WEB',
  name: 'Web 開発',
  description: null,
  isArchived: false,
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
  currentUserRole: ProjectRole.Owner,
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
  fetchMock.mockResolvedValue(Response.json(project));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getProject の認証付き詳細取得', () => {
  it('サーバー用クライアントでセッションを取得し、Bearer token を付けて詳細を取得する', async () => {
    await expect(getProject(project.id)).resolves.toEqual(project);

    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project-1',
      {
        headers: {
          Authorization: 'Bearer test-access-token',
        },
        cache: 'no-store',
      },
    );
  });

  it('セッションがない場合は、詳細 API を呼ばずにエラーを投げる', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(getProject(project.id)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得にエラーがある場合は、セッションが返っていても詳細 API を呼ばない', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: new Error('Session read failed'),
    });

    await expect(getProject(project.id)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('詳細 API が 404 を返した場合は、画面側で notFound() を呼べるように null を返す', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(getProject(project.id)).resolves.toBeNull();
  });

  it.each([401, 403, 500])(
    '詳細 API が %s を返した場合は、成功や 404 として扱わずエラーを投げる',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      await expect(getProject(project.id)).rejects.toThrow(
        'プロジェクト詳細の取得に失敗しました。',
      );
    },
  );

  it('API の URL が未設定の場合は、セッション取得と API 呼び出しを行わない', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(getProject(project.id)).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL が設定されていません。',
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('通信が失敗した場合は、呼び出し側が catch できるようにエラーを伝える', async () => {
    const networkError = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(networkError);

    await expect(getProject(project.id)).rejects.toThrow(networkError);
  });
});
