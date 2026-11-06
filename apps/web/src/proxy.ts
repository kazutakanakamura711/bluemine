import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // 認証と Project の画面だけを対象にし、画像や静的ファイルでは実行しない。
  matcher: ['/', '/login', '/register', '/auth/:path*', '/projects/:path*'],
};
