// @vitest-environment node

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  verifyOtp: vi.fn(),
}));

// Supabase には通信せず、確認の成功・失敗を再現する。
// NextRequest と NextResponse は実際の Next.js のものを使う。
vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

const tokenHash = 'test-confirmation-token-hash';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: { verifyOtp: mocks.verifyOtp },
  });
  mocks.verifyOtp.mockResolvedValue({
    data: { session: { access_token: 'test-access-token' } },
    error: null,
  });
});

describe('GET /confirm のメール確認', () => {
  it('サーバー用クライアントで確認情報を検証し、成功したらプロジェクト一覧へ移動する', async () => {
    const request = new NextRequest(
      `http://localhost:3000/confirm?token_hash=${tokenHash}&type=email`,
    );

    const response = await GET(request);

    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: tokenHash,
      type: 'email',
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(
      'http://localhost:3000/projects',
    );
  });

  it('期限切れ・使用済みなどで検証に失敗したら、エラーの目印付きでログイン画面へ移動する', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: {
        code: 'otp_expired',
        message: 'Email link is invalid or expired',
      },
    });
    const request = new NextRequest(
      `http://localhost:3000/confirm?token_hash=${tokenHash}&type=email`,
    );

    const response = await GET(request);

    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: tokenHash,
      type: 'email',
    });
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(
      'http://localhost:3000/login?error=confirmation_failed',
    );
  });

  it.each([
    { name: '確認情報がない', query: '' },
    { name: 'token_hash がない', query: '?type=email' },
    { name: 'token_hash が空文字', query: '?token_hash=&type=email' },
    { name: 'type がない', query: `?token_hash=${tokenHash}` },
    { name: 'type が空文字', query: `?token_hash=${tokenHash}&type=` },
    {
      name: 'type がメール確認以外',
      query: `?token_hash=${tokenHash}&type=recovery`,
    },
  ])('$name場合は 400 を返し、Supabase を呼ばない', async ({ query }) => {
    const request = new NextRequest(`http://localhost:3000/confirm${query}`);

    const response = await GET(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: '確認リンクが無効です。',
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it.each([
    { result: '成功', error: null, redirectPath: '/projects' },
    {
      result: '失敗',
      error: { code: 'otp_expired' },
      redirectPath: '/login?error=confirmation_failed',
    },
  ])(
    '確認$result時に秘密の値や指定された外部 URL を引き継がず、キャッシュと参照元の送信を抑止する',
    async ({ error, redirectPath }) => {
      mocks.verifyOtp.mockResolvedValue({ error });
      const requestUrl = new URL('https://app.example.com/confirm');
      requestUrl.searchParams.set('token_hash', tokenHash);
      requestUrl.searchParams.set('type', 'email');
      requestUrl.searchParams.set('next', 'https://external.example.com');
      requestUrl.searchParams.set(
        'redirect_to',
        'https://external.example.com',
      );
      requestUrl.searchParams.set('access_token', 'test-access-token');
      requestUrl.searchParams.set('refresh_token', 'test-refresh-token');

      const response = await GET(new NextRequest(requestUrl));

      expect(response.headers.get('Location')).toBe(
        `https://app.example.com${redirectPath}`,
      );
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(await response.text()).toBe('');
    },
  );
});
