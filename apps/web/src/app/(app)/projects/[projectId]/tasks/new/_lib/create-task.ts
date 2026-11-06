import { getErrorMessage } from '@/app/(app)/projects/_lib/api-error';
import type { Task } from '@/features/tasks/types/task';
import type { TaskPriority } from '@/features/tasks/types/task-priority';
import type { TaskStatus } from '@/features/tasks/types/task-status';
import { createClient } from '@/lib/supabase/client';

// POST /api/projects/:projectId/tasks に送る本文の型。
// ProjectはURLで指定し、番号・報告者はBackendで設定するため本文に含めない。
export type CreateTaskInput = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  // 日付は時刻を持たないYYYY-MM-DD。省略・nullは未設定とする。
  startDate?: string | null;
  dueDate?: string | null;
};

// 画面側で、入力不正・権限不足・アーカイブ済みなどの失敗を区別するためのエラー。
export class CreateTaskRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

// 成功時の返却項目は詳細取得と同じなので、共通のTask型を使う。
export async function createTask(
  projectId: string,
  input: CreateTaskInput,
): Promise<Task> {
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
    `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/tasks`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    // JSONでないエラー本文でも、作成失敗として扱えるようにする。
    const errorBody: unknown = await response.json().catch(() => null);

    throw new CreateTaskRequestError(
      getErrorMessage(errorBody) ?? 'タスクの作成に失敗しました。',
      response.status,
    );
  }

  // APIが採番した番号・設定した報告者を含む、作成済みのTaskを返す。
  return response.json();
}
