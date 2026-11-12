import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInvitationClient } from './invitation-client';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/config', () => ({
  getSupabaseConfig: () => ({
    url: 'https://supabase.example.test',
    publishableKey: 'test-publishable-key',
  }),
}));

beforeEach(() => vi.resetAllMocks());

describe('招待画面専用クライアント', () => {
  it('通常の Cookie や URL を使わず、一時セッションを永続化しない', () => {
    createInvitationClient();
    createInvitationClient();

    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://supabase.example.test',
      'test-publishable-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  });
});
