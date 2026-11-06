import { createClient } from '@/lib/supabase/client';
import { ProjectRole } from '@/features/projects/types/project-role';
import {
  getErrorMessage,
  ProjectRequestError,
} from '@/app/(app)/projects/_lib/api-error';
import type { ProjectMember } from './get-project-members';

export type AddProjectMemberInput = {
  email: string;
  // ProjectRoleのownerだけを省く
  role: Exclude<ProjectRole, typeof ProjectRole.Owner>;
};

// メンバー追加API を呼び出す。
// 成功時は追加したメンバーを返す、失敗時は画面で扱えるエラーを投げる。
export async function addProjectMember(
  projectId: string,
  input: AddProjectMemberInput,
): Promise<ProjectMember> {
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
    `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/members`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(input),
    },
  );

  if (!response.ok) {
    // JSON でない本文や空の本文の場合は null とする。
    const errorBody: unknown = await response.json().catch(() => null);

    throw new ProjectRequestError(
      getErrorMessage(errorBody) ?? 'メンバーの追加に失敗しました。',
      response.status,
    );
  }

  return response.json();
}
