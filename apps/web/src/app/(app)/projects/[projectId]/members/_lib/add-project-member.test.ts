// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addProjectMember,
  type AddProjectMemberInput,
} from './add-project-member';
import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import type { ProjectMember } from './get-project-members';
import { ProjectRole } from '@/features/projects/types/project-role';

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

const input: AddProjectMemberInput = {
  email: 'Member@example.test',
  role: ProjectRole.Member,
};

const member: ProjectMember = {
  id: 'membership-1',
  userId: 'user-1',
  role: ProjectRole.Member,
  createdAt: '2026-10-19T00:00:00.000Z',
  user: { name: null, email: input.email },
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
  fetchMock.mockResolvedValue(Response.json(member, { status: 201 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('addProjectMember の認証付き追加', () => {
  it.each([ProjectRole.Member, ProjectRole.Viewer])(
    '%s を指定して Bearer token 付きで POST し、201 のメンバーを返す',
    async (role) => {
      const requestInput: AddProjectMemberInput = { ...input, role };
      const createdMember: ProjectMember = { ...member, role };
      fetchMock.mockResolvedValue(
        Response.json(createdMember, { status: 201 }),
      );

      await expect(addProjectMember(projectId, requestInput)).resolves.toEqual(
        createdMember,
      );

      expect(mocks.createClient).toHaveBeenCalledOnce();
      expect(mocks.getSession).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3001/api/projects/project-1/members',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-access-token',
          },
          body: JSON.stringify(requestInput),
        },
      );
    },
  );

  it('projectId の予約文字をエンコードして追加先の URL を組み立てる', async () => {
    await addProjectMember('project/with spaces?tab=members#list', input);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/projects/project%2Fwith%20spaces%3Ftab%3Dmembers%23list/members',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('セッションがない場合は、追加 API を呼ばずにエラーを投げる', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(addProjectMember(projectId, input)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得にエラーがある場合は、セッションが返っていても追加 API を呼ばない', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: new Error('Session read failed'),
    });

    await expect(addProjectMember(projectId, input)).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('セッション取得の通信が失敗した場合は、追加 API を呼ばずエラーを伝える', async () => {
    const sessionError = new TypeError('Failed to fetch');
    mocks.getSession.mockRejectedValue(sessionError);

    await expect(addProjectMember(projectId, input)).rejects.toBe(sessionError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 同じ status の失敗でも、API が返す理由を区別して伝える。
  it.each([
    { status: 401, message: 'Unauthorized' },
    {
      status: 403,
      message: 'プロジェクトに参加者を追加する権限がありません',
    },
    { status: 404, message: 'プロジェクトが見つかりません' },
    { status: 404, message: '追加対象のユーザーが見つかりません' },
    {
      status: 409,
      message: 'アーカイブ済みのプロジェクトにメンバーを追加できません',
    },
    { status: 409, message: '指定したユーザーはすでに参加しています' },
  ])(
    '$status「$message」を ProjectRequestError として伝える',
    async ({ status, message }) => {
      fetchMock.mockResolvedValue(Response.json({ message }, { status }));

      const request = addProjectMember(projectId, input);

      await expect(request).rejects.toBeInstanceOf(ProjectRequestError);
      await expect(request).rejects.toMatchObject({
        statusCode: status,
        message,
      });
    },
  );

  it('400 の message が配列の場合は、汎用メッセージと statusCode を伝える', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ message: ['email must be an email'] }, { status: 400 }),
    );

    const request = addProjectMember(projectId, input);

    await expect(request).rejects.toBeInstanceOf(ProjectRequestError);
    await expect(request).rejects.toMatchObject({
      statusCode: 400,
      message: 'メンバーの追加に失敗しました。',
    });
  });

  it.each([
    { description: 'JSON でない', body: 'Internal Server Error' },
    { description: '空の', body: null },
  ])(
    'API が $description エラー本文を返した場合は、汎用メッセージと statusCode を伝える',
    async ({ body }) => {
      fetchMock.mockResolvedValue(new Response(body, { status: 500 }));

      const request = addProjectMember(projectId, input);

      await expect(request).rejects.toBeInstanceOf(ProjectRequestError);
      await expect(request).rejects.toMatchObject({
        statusCode: 500,
        message: 'メンバーの追加に失敗しました。',
      });
    },
  );

  it('追加 API の通信が失敗した場合は、そのエラーを伝える', async () => {
    const networkError = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(networkError);

    await expect(addProjectMember(projectId, input)).rejects.toBe(networkError);
  });

  it('API の URL が未設定の場合は、セッション取得と API 呼び出しを行わない', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(addProjectMember(projectId, input)).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL が設定されていません。',
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
