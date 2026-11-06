// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { getProjectMembers, type ProjectMember } from './get-project-members';
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
const projectId = 'project-1';
const members: ProjectMember[] = [
  {
    id: 'membership-owner',
    userId: 'user-owner',
    role: ProjectRole.Owner,
    createdAt: '2026-10-11T00:00:00.000Z',
    user: { name: '中村', email: 'owner@example.test' },
  },
  {
    id: 'membership-member',
    userId: 'user-member',
    role: ProjectRole.Member,
    createdAt: '2026-10-12T00:00:00.000Z',
    user: { name: '山田太郎', email: 'member@example.test' },
  },
  {
    id: 'membership-viewer',
    userId: 'user-viewer',
    role: ProjectRole.Viewer,
    createdAt: '2026-10-13T00:00:00.000Z',
    user: { name: null, email: 'viewer@example.test' },
  },
];

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
  fetchMock.mockResolvedValue(Response.json(members));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getProjectMembers の認証付き一覧取得', () => {
  it('Bearer token を付けて取得し、API の項目・名前の null・並び順を維持する', async () => {
    await expect(getProjectMembers(projectId)).resolves.toEqual(members);

    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project-1/members',
      {
        headers: {
          Authorization: 'Bearer test-access-token',
        },
        cache: 'no-store',
      },
    );
  });

  it('projectId に含まれる予約文字を URL のパスに混ぜずエンコードする', async () => {
    await getProjectMembers('project/with space?#');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project%2Fwith%20space%3F%23/members',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('成功時の空配列は、対象不在の null と区別して返す', async () => {
    fetchMock.mockResolvedValue(Response.json([]));

    await expect(getProjectMembers(projectId)).resolves.toEqual([]);
  });

  it('セッションがなければ、API を呼ばずにエラーを投げる', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(getProjectMembers(projectId)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得にエラーがあれば、セッションが返っていても API を呼ばない', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: new Error('Session read failed'),
    });

    await expect(getProjectMembers(projectId)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('404 は、画面側で notFound() を呼べるように null を返す', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(getProjectMembers(projectId)).resolves.toBeNull();
  });

  it.each([401, 403, 500])(
    '%s は、statusCode を持つ ProjectRequestError として伝える',
    async (statusCode) => {
      fetchMock.mockResolvedValue(new Response(null, { status: statusCode }));

      const result = getProjectMembers(projectId);

      await expect(result).rejects.toBeInstanceOf(ProjectRequestError);
      await expect(result).rejects.toMatchObject({
        message: 'プロジェクトメンバーの取得に失敗しました。',
        statusCode,
      });
    },
  );

  it('API の URL が未設定なら、セッション取得と API 呼び出しを行わない', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(getProjectMembers(projectId)).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL が設定されていません。',
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('通信が失敗した場合は、そのエラーを呼び出し側へ伝える', async () => {
    const networkError = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(networkError);

    await expect(getProjectMembers(projectId)).rejects.toBe(networkError);
  });
});
