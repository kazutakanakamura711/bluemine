import { getErrorMessage } from '@/app/(app)/projects/_lib/api-error';
import { createClient } from '@/lib/supabase/client';

export class DeleteTaskRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

export async function deleteTask(
  projectId: string,
  taskId: string,
): Promise<void> {
  // この設定値には /api まで含まれている。
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL が設定されていません。');
  }

  // フォームから呼び出すため、ブラウザ用クライアントでセッションを取得する。
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error('ログインセッションを取得できませんでした。');
  }

  const response = await fetch(
    `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    },
  );

  if (!response.ok) {
    // JSONでないエラー本文でも、削除失敗として扱えるようにする。
    const errorBody: unknown = await response.json().catch(() => null);

    throw new DeleteTaskRequestError(
      getErrorMessage(errorBody) ?? 'タスクの削除に失敗しました。',
      response.status,
    );
  }
}
