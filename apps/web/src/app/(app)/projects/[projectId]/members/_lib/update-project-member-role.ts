import { ProjectRole } from '@/features/projects/types/project-role';
import type { ProjectMember } from './get-project-members';
import { createClient } from '@/lib/supabase/client';
import {
  getErrorMessage,
  ProjectRequestError,
} from '@/app/(app)/projects/_lib/api-error';

export type UpdateProjectMemberRoleInput = {
  // ProjectRoleのownerだけを省く
  role: Exclude<ProjectRole, typeof ProjectRole.Owner>;
};

export async function updateProjectMemberRole(
  projectId: string,
  projectMemberId: string,
  input: UpdateProjectMemberRoleInput,
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
    `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(projectMemberId)}`,
    {
      method: 'PATCH',
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
      getErrorMessage(errorBody) ?? 'メンバーの権限変更に失敗しました。',
      response.status,
    );
  }

  return response.json();
}
