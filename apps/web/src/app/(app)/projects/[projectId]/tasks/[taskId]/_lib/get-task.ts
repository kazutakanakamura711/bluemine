import { connection } from 'next/server';

import type { Task } from '@/features/tasks/types/task';
import { createClient } from '@/lib/supabase/server';

export async function getTask(
  projectId: string,
  taskId: string,
): Promise<Task | null> {
  // 参加情報やタスクの最新の状態を、リクエストごとに API で確認する。
  await connection();

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL が設定されていません。');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error('ログインセッションを取得できませんでした。');
  }

  const response = await fetch(
    `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
    {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
      cache: 'no-store',
    },
  );

  // Project 不在・非参加・Task 不在は、ページ側で notFound() に変換する。
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error('タスク詳細の取得に失敗しました。');
  }

  return response.json();
}
