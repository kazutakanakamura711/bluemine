import { createClient } from '@supabase/supabase-js';

import { getSupabaseConfig } from './config';

// メール確認専用。ブラウザの Cookie を使わず、リクエストごとに作る。
export function createConfirmationClient() {
  const { url, publishableKey } = getSupabaseConfig();

  return createClient(url, publishableKey, {
    auth: {
      // 確認時に発行されたセッションを保存・自動更新しない。
      persistSession: false,
      autoRefreshToken: false,
      // URL からセッションを自動的に取り込まない。
      detectSessionInUrl: false,
    },
  });
}
