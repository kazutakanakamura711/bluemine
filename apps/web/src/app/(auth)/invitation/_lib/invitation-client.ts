import { createClient } from '@supabase/supabase-js';

import { getSupabaseConfig } from '@/lib/supabase/config';

// 招待画面ごとに専用クライアントを作る。
// 通常ログイン用クライアントとは分け、別アカウントへ切り替わるのを防ぐ。
export function createInvitationClient() {
  // 接続先とブラウザに公開できる Publishable key を取得する。
  const { url, publishableKey } = getSupabaseConfig();

  return createClient(url, publishableKey, {
    auth: {
      // 一時セッションはこのクライアントのメモリに保持し、Cookie や localStorage に保存しない。
      persistSession: false,
      // バックグラウンドでの定期更新を止める。セッションの有効期限は Supabase が扱う。
      autoRefreshToken: false,
      // リンクを開いただけで URL から認証情報を自動的に取り込まない。
      detectSessionInUrl: false,
    },
  });
}
