import {
  getErrorMessage,
  ProjectRequestError,
} from '@/app/(app)/projects/_lib/api-error';
import { createClient } from '@/lib/supabase/client';

// NestJS の POST /projects に送るリクエスト本文の形。
export type CreateProjectInput = {
  name: string;
  key: string;
  description?: string;
};

// プロジェクト作成 API を呼び出し、成功時は何も返さず、失敗時はエラーを投げる。
export async function createProject(input: CreateProjectInput): Promise<void> {
  // Client Component からも参照できる公開用の API ベース URL を取得する。
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL が設定されていません。');
  }

  // Cookie を扱えるブラウザ用クライアントを作る。
  const supabase = createClient();
  // 作ったクライアントを使い、Cookie に保存されたセッションを取得する。
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error('ログインセッションを取得できませんでした。');
  }

  const accessToken = data.session.access_token;

  // 入力値を JSON にして NestJS の作成 endpoint へ POST する。
  const response = await fetch(`${apiBaseUrl}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(input),
  });

  if (response.ok) {
    return;
  }

  // JSON でないエラー本文や空の本文もあり得るため、解析に失敗したら null とする。
  const errorBody: unknown = await response.json().catch(() => null);

  // API が返した message を使い、取得できない場合は画面用の汎用メッセージを使う。
  throw new ProjectRequestError(
    getErrorMessage(errorBody) ?? 'プロジェクトの作成に失敗しました。',
    response.status,
  );
}
