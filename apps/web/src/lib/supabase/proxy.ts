import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getSupabaseConfig } from './config';

export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabaseConfig();
  const cacheHeaders = new Headers();
  const responseCookies: {
    name: string;
    value: string;
    options: CookieOptions;
  }[] = [];

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // 後続の Server Component 用に更新し、ブラウザへ返す Cookie も集める。
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          responseCookies.push({ name, value, options });
        });

        // SDK が渡すキャッシュ制御は最初の setAll にだけ含まれるため、保持する。
        Object.entries(headers).forEach(([name, value]) =>
          cacheHeaders.set(name, value),
        );
      },
    },
  });

  // getClaims がCookieから現在のセッションの access_token の署名・有効期限を確認しトークン内の情報を返す、必要なら SDK がセッションを更新する。
  const { data, error } = await supabase.auth.getClaims();

  // URL のパス部分を取り出す。
  const pathname = request.nextUrl.pathname;

  // プロジェクト一覧と、その配下の画面を対象にする。
  const isProjectRoute =
    pathname === '/projects' || pathname.startsWith('/projects/');

  // エラーがなく、検証済みのトークン情報があるか確認する。
  const isAuthenticated = !error && Boolean(data?.claims);
  const shouldRedirectToLogin = isProjectRoute && !isAuthenticated;

  if (shouldRedirectToLogin) {
    // ログイン状態によって変わる移動先をキャッシュさせない。
    cacheHeaders.set('Cache-Control', 'private, no-store');
  }

  // 必要な応答を一度だけ作る。
  const response = shouldRedirectToLogin
    ? NextResponse.redirect(new URL('/login', request.url), {
        headers: cacheHeaders,
      })
    : NextResponse.next({
        request, // 更新した Cookie を含むリクエストヘッダーを、後続の Next.js 処理へ渡します。
        headers: cacheHeaders, // ブラウザへ返す応答に、キャッシュ制御ヘッダーを付けます。
      });

  // どちらの応答にも、SDK が更新した Cookie を付ける。
  responseCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options),
  );

  return response;
}
