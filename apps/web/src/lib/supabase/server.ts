import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getSupabaseConfig } from './config';

// 接続設定と Cookie の読み書きを用意し、SDK のサーバー用クライアントを作る。
// リクエストごとに作り、そのリクエストの Cookie だけを参照する。
export async function createClient() {
  const { url, publishableKey } = getSupabaseConfig();
  const cookieStore = await cookies();

  // SDK が、auth.getSession() などを呼べるクライアントを返す。
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        // SDK がセッションを読む際に、Next.js の Cookie を渡す。
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          // Server Action / Route Handler では Cookie を保存できる。
          cookiesToSet.forEach(({ name, value, options }) =>
            // 配列の Cookie を1つずつ Next.js に設定する。
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component は Cookie を書けないため、手前の Proxy に更新を任せる。
        }
      },
    },
  });
}
