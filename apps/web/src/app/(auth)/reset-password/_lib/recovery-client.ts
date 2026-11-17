import { createClient } from '@supabase/supabase-js';

import { getSupabaseConfig } from '@/lib/supabase/config';

// 再設定画面ごとに作り、通常ログインや招待画面のクライアントと共有しない。
export function createRecoveryClient() {
  const { url, publishableKey } = getSupabaseConfig();

  return createClient(url, publishableKey, {
    auth: {
      // 検証後の一時セッションは、このクライアントのメモリにだけ保持する。
      persistSession: false,
      // 定期更新を行わない。有効期限や失効の判断は Supabase が行う。
      autoRefreshToken: false,
      // 画面を開いただけでは、URL の認証情報を取り込まない。
      detectSessionInUrl: false,
    },
  });
}
