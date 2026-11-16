import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRecoveryClient } from './recovery-client';

vi.mock('@/lib/supabase/config', () => ({
  getSupabaseConfig: () => ({
    url: 'https://supabase.example.test',
    publishableKey: 'test-publishable-key',
  }),
}));

const clients: ReturnType<typeof createRecoveryClient>[] = [];

afterEach(async () => {
  for (const client of clients) await client.auth.dispose();
  clients.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.cookie = 'sb-supabase-auth-token=; Max-Age=0; Path=/';
  window.history.replaceState(null, '', '/');
});

describe('再設定画面専用クライアント', () => {
  it('URLを自動処理せず、検証したセッションを他のクライアントや保存領域へ渡さない', async () => {
    // SDKそのものを使い、通信先だけをテスト内の応答へ置き換える。
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'test-recovery-access-token',
          refresh_token: 'test-recovery-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: 'recovery-user', email: 'recovery@example.test' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const broadcastChannel = vi.fn();
    vi.stubGlobal('BroadcastChannel', broadcastChannel);

    document.cookie = 'sb-supabase-auth-token=normal-session; Path=/';
    localStorage.setItem('sb-supabase-auth-token', 'normal-session');
    const originalCookie = document.cookie;
    const readStorage = vi.spyOn(Storage.prototype, 'getItem');
    const writeStorage = vi.spyOn(Storage.prototype, 'setItem');
    const removeStorage = vi.spyOn(Storage.prototype, 'removeItem');
    window.history.replaceState(
      null,
      '',
      '/reset-password#access_token=url-token&refresh_token=url-refresh&type=recovery&expires_in=3600&token_type=bearer',
    );
    const originalUrl = window.location.href;

    const client = createRecoveryClient();
    clients.push(client);
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.href).toBe(originalUrl);

    const { data, error } = await client.auth.verifyOtp({
      token_hash: 'test-recovery-token-hash',
      type: 'recovery',
    });
    expect(error).toBeNull();
    expect(data.user?.id).toBe('recovery-user');
    expect((await client.auth.getSession()).data.session?.user.id).toBe(
      'recovery-user',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // ページを作り直した場合、検証済みの一時セッションは復元されない。
    const anotherClient = createRecoveryClient();
    clients.push(anotherClient);
    expect((await anotherClient.auth.getSession()).data.session).toBeNull();
    expect(document.cookie).toBe(originalCookie);
    expect(readStorage).not.toHaveBeenCalled();
    expect(writeStorage).not.toHaveBeenCalled();
    expect(removeStorage).not.toHaveBeenCalled();
    expect(broadcastChannel).not.toHaveBeenCalled();
  });
});
