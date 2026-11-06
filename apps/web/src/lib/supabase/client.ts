import { createBrowserClient } from '@supabase/ssr';

import { getSupabaseConfig } from './config';

// Client Component から使う。セッションの Cookie 保存・読み取りは SDK に任せる。
export function createClient() {
  const { url, publishableKey } = getSupabaseConfig();

  // Supabase と通信するためのオブジェクトを返す。
  return createBrowserClient(url, publishableKey);
}
