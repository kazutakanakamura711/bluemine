// @vitest-environment node

import type { CookieMethodsServer } from '@supabase/ssr';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { config as proxyConfig } from '@/proxy';
import { createClient as createBrowserClient } from './client';
import { updateSession } from './proxy';
import { createClient as createServerClient } from './server';

const mocks = vi.hoisted(() => ({
  browserClient: vi.fn(),
  serverClient: vi.fn(),
  cookies: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: mocks.browserClient,
  createServerClient: mocks.serverClient,
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));

const cacheHeaders = {
  'Cache-Control': 'private, no-store',
  Expires: '0',
  Pragma: 'no-cache',
};

const authenticatedClaimsResult = {
  data: { claims: { sub: 'test-user-id' } },
  error: null,
};

function getCookieMethods(index = 0): CookieMethodsServer {
  return mocks.serverClient.mock.calls[index][2].cookies;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  mocks.getClaims.mockResolvedValue(authenticatedClaimsResult);
  mocks.serverClient.mockReturnValue({ auth: { getClaims: mocks.getClaims } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Supabase クライアント', () => {
  it('公開用の接続設定が不足していたらブラウザ用クライアントを作らない', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', undefined);

    expect(() => createBrowserClient()).toThrow(
      'NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を設定してください。',
    );
    expect(mocks.browserClient).not.toHaveBeenCalled();
  });

  it('サーバー用クライアントは各リクエストの Cookie を分けて参照する', async () => {
    const firstCookies = [{ name: 'session', value: 'user-a' }];
    const secondCookies = [{ name: 'session', value: 'user-b' }];
    mocks.cookies
      .mockResolvedValueOnce({ getAll: () => firstCookies })
      .mockResolvedValueOnce({ getAll: () => secondCookies });

    await createServerClient();
    await createServerClient();

    expect(mocks.serverClient).toHaveBeenCalledTimes(2);
    expect(getCookieMethods(0).getAll!()).toEqual(firstCookies);
    expect(getCookieMethods(1).getAll!()).toEqual(secondCookies);
  });

  it('Cookie を書き込める Server Action / Route Handler では SDK の設定を保存する', async () => {
    const set = vi.fn();
    mocks.cookies.mockResolvedValue({ getAll: () => [], set });
    await createServerClient();

    await getCookieMethods().setAll!(
      [
        {
          name: 'session',
          value: 'updated',
          options: { path: '/', sameSite: 'lax' },
        },
      ],
      cacheHeaders,
    );

    expect(set).toHaveBeenCalledWith('session', 'updated', {
      path: '/',
      sameSite: 'lax',
    });
  });

  it('Cookie が読み取り専用でも Server Component の処理を妨げない', async () => {
    mocks.cookies.mockResolvedValue({
      getAll: () => [],
      set: () => {
        throw new Error(
          'Cookies can only be modified in a Server Action or Route Handler.',
        );
      },
    });
    await createServerClient();

    expect(() =>
      getCookieMethods().setAll!(
        [{ name: 'session', value: 'updated', options: { path: '/' } }],
        cacheHeaders,
      ),
    ).not.toThrow();
  });
});

describe('Supabase セッションの Proxy', () => {
  it('セッションがないアクセスも確認処理を通り、Cookie を追加しない', async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    const request = new NextRequest('http://localhost:3000/');

    const response = await updateSession(request);

    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(getCookieMethods().getAll!()).toEqual([]);
    expect(response.status).toBe(200);
    expect(response.cookies.getAll()).toEqual([]);
  });

  it('更新後の Cookie を後続の画面処理とブラウザの両方へ渡す', async () => {
    const request = new NextRequest('http://localhost:3000/projects', {
      headers: { cookie: 'session=old' },
    });
    mocks.getClaims.mockImplementation(async () => {
      const cookieMethods = getCookieMethods();
      expect(cookieMethods.getAll!()).toEqual([
        { name: 'session', value: 'old' },
      ]);
      await cookieMethods.setAll!(
        [
          {
            name: 'session',
            value: 'updated',
            options: { path: '/', sameSite: 'lax', httpOnly: false },
          },
        ],
        cacheHeaders,
      );
      return authenticatedClaimsResult;
    });

    const response = await updateSession(request);

    expect(request.cookies.get('session')?.value).toBe('updated');
    expect(response.headers.get('x-middleware-request-cookie')).toContain(
      'session=updated',
    );
    expect(response.cookies.get('session')).toMatchObject({
      value: 'updated',
      path: '/',
      sameSite: 'lax',
    });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('pragma')).toBe('no-cache');
  });

  it('SDK が複数回 Cookie を設定しても、先の Cookie とキャッシュ制御を保持する', async () => {
    const request = new NextRequest('http://localhost:3000/projects');
    mocks.getClaims.mockImplementation(async () => {
      const { setAll } = getCookieMethods();
      await setAll!(
        [{ name: 'session.0', value: 'first', options: { path: '/' } }],
        cacheHeaders,
      );
      await setAll!(
        [{ name: 'session.1', value: 'second', options: { path: '/' } }],
        {},
      );
      return authenticatedClaimsResult;
    });

    const response = await updateSession(request);

    expect(response.cookies.get('session.0')?.value).toBe('first');
    expect(response.cookies.get('session.1')?.value).toBe('second');
    expect(response.headers.get('x-middleware-request-cookie')).toContain(
      'session.0=first',
    );
    expect(response.headers.get('x-middleware-request-cookie')).toContain(
      'session.1=second',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('pragma')).toBe('no-cache');
  });

  it('同じ Cookie の再更新は最後の値・設定を使い、不要な Cookie の削除設定も返す', async () => {
    const request = new NextRequest('http://localhost:3000/projects', {
      headers: { cookie: 'session=old; session.0=old-chunk' },
    });
    mocks.getClaims.mockImplementation(async () => {
      const { setAll } = getCookieMethods();
      await setAll!(
        [
          {
            name: 'session',
            value: 'intermediate',
            options: { path: '/', sameSite: 'lax' },
          },
        ],
        cacheHeaders,
      );
      await setAll!(
        [
          {
            name: 'session',
            value: 'latest',
            options: { path: '/', sameSite: 'strict', secure: true },
          },
          {
            name: 'session.0',
            value: '',
            options: { path: '/', maxAge: 0 },
          },
        ],
        {},
      );
      return authenticatedClaimsResult;
    });

    const response = await updateSession(request);

    expect(response.headers.get('x-middleware-request-cookie')).toContain(
      'session=latest',
    );
    expect(response.cookies.get('session')).toMatchObject({
      value: 'latest',
      path: '/',
      sameSite: 'strict',
      secure: true,
    });
    expect(response.cookies.get('session.0')).toMatchObject({
      value: '',
      path: '/',
      maxAge: 0,
    });
    expect(response.cookies.getAll()).toHaveLength(2);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('別ユーザーのリクエストに、先の更新 Cookie を混ぜない', async () => {
    mocks.getClaims.mockImplementationOnce(async () => {
      await getCookieMethods().setAll!(
        [{ name: 'session', value: 'user-a', options: { path: '/' } }],
        cacheHeaders,
      );
      return authenticatedClaimsResult;
    });
    await updateSession(new NextRequest('http://localhost:3000/projects'));

    const secondResponse = await updateSession(
      new NextRequest('http://localhost:3000/projects'),
    );

    expect(getCookieMethods(1).getAll!()).toEqual([]);
    expect(secondResponse.cookies.getAll()).toEqual([]);
    expect(secondResponse.headers.get('cache-control')).toBeNull();
  });

  it('認証・Project の URL で実行し、画像・静的ファイルでは実行しない', () => {
    const matches = (url: string) =>
      unstable_doesMiddlewareMatch({
        config: proxyConfig,
        nextConfig: {},
        url,
      });

    for (const url of [
      '/',
      '/login',
      '/register',
      '/auth/confirm',
      '/projects',
      '/projects/123',
    ]) {
      expect(matches(url)).toBe(true);
    }
    for (const url of [
      '/_next/static/chunk.js',
      '/_next/image',
      '/favicon.ico',
      '/globe.svg',
    ]) {
      expect(matches(url)).toBe(false);
    }
  });
});

describe('Project 画面の未ログイン導線', () => {
  it.each([
    '/projects',
    '/projects/new',
    '/projects/123',
    '/projects/123/settings',
  ])(
    '未ログインで %s を開いたら、画面処理を進めずログイン画面へ移動する',
    async (pathname) => {
      mocks.getClaims.mockResolvedValue({ data: null, error: null });
      const request = new NextRequest(`http://localhost:3000${pathname}`);

      const response = await updateSession(request);

      expect(mocks.getClaims).toHaveBeenCalledOnce();
      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/login',
      );
      expect(response.headers.get('x-middleware-next')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.cookies.getAll()).toEqual([]);
    },
  );

  it.each(['/projects', '/projects/123'])(
    '検証済みのトークン情報があれば %s の画面処理を続ける',
    async (pathname) => {
      const request = new NextRequest(`http://localhost:3000${pathname}`, {
        headers: { cookie: 'session=signed-in' },
      });

      const response = await updateSession(request);

      expect(mocks.getClaims).toHaveBeenCalledOnce();
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it.each(['/login', '/register', '/projects-other'])(
    '未ログインでも %s は処理を続け、ログイン画面へのループやパスの誤判定を防ぐ',
    async (pathname) => {
      mocks.getClaims.mockResolvedValue({ data: null, error: null });
      const request = new NextRequest(`http://localhost:3000${pathname}`);

      const response = await updateSession(request);

      expect(mocks.getClaims).toHaveBeenCalledOnce();
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it('Cookie があってもトークンの検証に失敗したらログイン画面へ移動する', async () => {
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: { code: 'bad_jwt', message: 'Invalid JWT' },
    });
    const request = new NextRequest('http://localhost:3000/projects', {
      headers: { cookie: 'session=invalid-token' },
    });

    const response = await updateSession(request);

    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(getCookieMethods().getAll!()).toEqual([
      { name: 'session', value: 'invalid-token' },
    ]);
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
    expect(response.headers.get('x-middleware-next')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('セッション更新に失敗しても、削除する Cookie とキャッシュ制御をリダイレクト応答に付ける', async () => {
    const request = new NextRequest('http://localhost:3000/projects', {
      headers: { cookie: 'session=expired; session.0=expired-chunk' },
    });
    mocks.getClaims.mockImplementation(async () => {
      await getCookieMethods().setAll!(
        [{ name: 'session', value: '', options: { path: '/', maxAge: 0 } }],
        cacheHeaders,
      );
      await getCookieMethods().setAll!(
        [{ name: 'session.0', value: '', options: { path: '/', maxAge: 0 } }],
        {},
      );
      return { data: null, error: { code: 'refresh_token_not_found' } };
    });

    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
    expect(response.cookies.get('session')).toMatchObject({
      value: '',
      path: '/',
      maxAge: 0,
    });
    expect(response.cookies.get('session.0')).toMatchObject({
      value: '',
      path: '/',
      maxAge: 0,
    });
    expect(response.cookies.getAll()).toHaveLength(2);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('expires')).toBe('0');
    expect(response.headers.get('pragma')).toBe('no-cache');
  });

  it('移動先に元のクエリや外部 URL を引き継がず、同じドメインのログイン画面へ移動する', async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null });
    const requestUrl = new URL('https://app.example.com/projects');
    requestUrl.searchParams.set('next', 'https://external.example.com');
    requestUrl.searchParams.set('access_token', 'test-access-token');

    const response = await updateSession(new NextRequest(requestUrl));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://app.example.com/login',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
