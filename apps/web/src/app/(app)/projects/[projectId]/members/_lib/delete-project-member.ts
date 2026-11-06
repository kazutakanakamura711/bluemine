import { createClient } from '@/lib/supabase/client';
import {
  getErrorMessage,
  ProjectRequestError,
} from '@/app/(app)/projects/_lib/api-error';

export async function deleteProjectMember(
  projectId: string,
  projectMemberId: string,
): Promise<void> {
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

  const response = await fetch(
    `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(projectMemberId)}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    // JSON でない本文や空の本文の場合は null とする。
    const errorBody: unknown = await response.json().catch(() => null);

    throw new ProjectRequestError(
      getErrorMessage(errorBody) ?? 'メンバーの削除に失敗しました。',
      response.status,
    );
  }
}
