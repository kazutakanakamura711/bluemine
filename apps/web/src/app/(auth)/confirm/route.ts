import { NextResponse, type NextRequest } from 'next/server';
import { createConfirmationClient } from '@/lib/supabase/confirmation';

export async function GET(request: NextRequest) {
  // URL の「?」以降にある情報を取り出す。
  const tokenHash = request.nextUrl.searchParams.get('token_hash');
  const type = request.nextUrl.searchParams.get('type');

  // 確認情報がない場合や、メール確認以外の場合は受け付けない。
  if (!tokenHash || type !== 'email') {
    return Response.json(
      { message: '確認リンクが無効です。' },
      { status: 400 },
    );
  }

  const supabase = createConfirmationClient();

  // Supabase が確認情報を検証し、成功するとセッションを発行する。
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });

  // 確認時に発行されたセッションは Cookie に保存せず、ログイン画面へ進む。
  const redirectPath = error
    ? '/login?error=confirmation_failed'
    : '/login?confirmation=success';

  // 新しい URL を作るため、元の token_hash は引き継がない。
  return NextResponse.redirect(new URL(redirectPath, request.url), {
    headers: {
      'Cache-Control': 'private, no-store', // この応答をキャッシュに保存させません。
      'Referrer-Policy': 'no-referrer', // 移動先へ、元のURLを参照元情報として送らない。
    },
  });
}
