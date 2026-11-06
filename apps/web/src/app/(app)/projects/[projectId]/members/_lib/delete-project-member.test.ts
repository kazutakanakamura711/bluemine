// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteProjectMember } from './delete-project-member';
import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';

// セッション取得と HTTP 通信をモックし、helper の入出力を確認する。
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: mocks.createClient,
}));

const fetchMock = vi.fn<typeof fetch>();
const projectId = 'project-1';
const projectMemberId = 'membership-1';

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

describe('deleteProjectMember の認証付き削除', () => {
  it('Bearer token 付きで本文なしの DELETE を送り、204 の本文を読まずに正常終了する', async () => {
    const response = new Response(null, { status: 204 });
    const jsonSpy = vi.spyOn(response, 'json');
    fetchMock.mockResolvedValue(response);

    await expect(
      deleteProjectMember(projectId, projectMemberId),
    ).resolves.toBeUndefined();

    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project-1/members/membership-1',
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-access-token',
        },
      },
    );
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('projectId の予約文字をエンコードして削除先の URL を組み立てる', async () => {
    await deleteProjectMember(
      'project/with spaces?tab=members#list',
      projectMemberId,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project%2Fwith%20spaces%3Ftab%3Dmembers%23list/members/membership-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('projectMemberId の予約文字をエンコードして削除先の URL を組み立てる', async () => {
    await deleteProjectMember(
      projectId,
      'membership/with spaces?role=viewer#target',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project-1/members/membership%2Fwith%20spaces%3Frole%3Dviewer%23target',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('セッションがない場合は、削除 API を呼ばずにエラーを投げる', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(
      deleteProjectMember(projectId, projectMemberId),
    ).rejects.toThrow('ログインセッションを取得できませんでした。');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得にエラーがある場合は、セッションが返っていても削除 API を呼ばない', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: new Error('Session read failed'),
    });

    await expect(
      deleteProjectMember(projectId, projectMemberId),
    ).rejects.toThrow('ログインセッションを取得できませんでした。');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得の通信が失敗した場合は、削除 API を呼ばずエラーを伝える', async () => {
    const sessionError = new TypeError('Failed to fetch');
    mocks.getSession.mockRejectedValue(sessionError);

    await expect(deleteProjectMember(projectId, projectMemberId)).rejects.toBe(
      sessionError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 同じ status の失敗でも、API が返す理由を区別して伝える。
  it.each([
    { status: 401, message: 'Unauthorized' },
    {
      status: 403,
      message: 'プロジェクトのメンバーを削除する権限がありません',
    },
    { status: 404, message: 'プロジェクトが見つかりません' },
    { status: 404, message: '削除対象のメンバーが見つかりません' },
    {
      status: 409,
      message: 'アーカイブ済みのプロジェクトではメンバーを削除できません',
    },
    { status: 409, message: 'owner は削除できません' },
  ])(
    '$status「$message」を ProjectRequestError として伝える',
    async ({ status, message }) => {
      fetchMock.mockResolvedValue(Response.json({ message }, { status }));

      const request = deleteProjectMember(projectId, projectMemberId);

      await expect(request).rejects.toBeInstanceOf(ProjectRequestError);
      await expect(request).rejects.toMatchObject({
        statusCode: status,
        message,
      });
    },
  );

  it('message が配列の場合は、汎用メッセージと statusCode を伝える', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ message: ['Internal Server Error'] }, { status: 500 }),
    );

    const request = deleteProjectMember(projectId, projectMemberId);

    await expect(request).rejects.toBeInstanceOf(ProjectRequestError);
    await expect(request).rejects.toMatchObject({
      statusCode: 500,
      message: 'メンバーの削除に失敗しました。',
    });
  });

  it.each([
    { description: 'JSON でない', body: 'Internal Server Error' },
    { description: '空の', body: null },
  ])(
    'API が $description エラー本文を返した場合は、汎用メッセージと statusCode を伝える',
    async ({ body }) => {
      fetchMock.mockResolvedValue(new Response(body, { status: 500 }));

      const request = deleteProjectMember(projectId, projectMemberId);

      await expect(request).rejects.toBeInstanceOf(ProjectRequestError);
      await expect(request).rejects.toMatchObject({
        statusCode: 500,
        message: 'メンバーの削除に失敗しました。',
      });
    },
  );

  it('削除 API の通信が失敗した場合は、そのエラーを伝える', async () => {
    const networkError = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(networkError);

    await expect(deleteProjectMember(projectId, projectMemberId)).rejects.toBe(
      networkError,
    );
  });

  it('API の URL が未設定の場合は、セッション取得と API 呼び出しを行わない', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(
      deleteProjectMember(projectId, projectMemberId),
    ).rejects.toThrow('NEXT_PUBLIC_API_BASE_URL が設定されていません。');
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
