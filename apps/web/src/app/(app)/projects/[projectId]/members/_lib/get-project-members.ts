import { connection } from 'next/server';
import type { ProjectRole } from '@/features/projects/types/project-role';
import { createClient } from '@/lib/supabase/server';
import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';

export type ProjectMember = {
  id: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
  user: {
    name: string | null;
    email: string;
  };
};

export async function getProjectMembers(
  projectId: string,
): Promise<ProjectMember[] | null> {
  // 詳細画面もリクエスト時に最新データを取得する。
  await connection();

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL が設定されていません。');
  }

  // Cookie を扱えるサーバー用クライアントを作る。
  const supabase = await createClient();
  // 作ったクライアントを使い、Cookie に保存されたセッションを取得する。
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error('ログインセッションを取得できませんでした。');
  }

  const accessToken = data.session.access_token;

  const response = await fetch(
    `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/members`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ProjectRequestError(
      'プロジェクトメンバーの取得に失敗しました。',
      response.status,
    );
  }

  return response.json();
}
