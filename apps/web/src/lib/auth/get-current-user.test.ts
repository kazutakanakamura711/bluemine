import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getCurrentUser, type CurrentUser } from './get-current-user';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:3001/api');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getCurrentUser', () => {
  it('Bearer token を NestJS に渡し、キャッシュせず本人のユーザー情報を取得する', async () => {
    const currentUser: CurrentUser = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: 'user@example.com',
      name: null,
      createdAt: '2026-10-06T00:00:00.000Z',
      updatedAt: '2026-10-06T00:00:00.000Z',
    };
    fetchMock.mockResolvedValue(Response.json(currentUser));

    await expect(getCurrentUser('test-access-token')).resolves.toEqual(
      currentUser,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/me',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer test-access-token' },
        cache: 'no-store',
      },
    );
  });

  it.each([401, 403, 500])(
    'API が %s を返した場合は、成功として扱わずエラーを投げる',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      await expect(getCurrentUser('test-access-token')).rejects.toThrow(
        'ユーザー情報の取得に失敗しました。',
      );
    },
  );

  it('API の URL が未設定の場合は、リクエストを送らずエラーを投げる', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', '');

    await expect(getCurrentUser('test-access-token')).rejects.toThrow(
      'NEXT_PUBLIC_API_BASE_URL が設定されていません。',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('通信が失敗した場合は、呼び出し側が catch できるようにエラーを伝える', async () => {
    const networkError = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(networkError);

    await expect(getCurrentUser('test-access-token')).rejects.toThrow(
      networkError,
    );
  });
});
