import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useController, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useRouter } from 'next/navigation';

import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import type { ProjectMember } from './get-project-members';
import { ProjectRole } from '@/features/projects/types/project-role';
import { updateProjectMemberRole } from './update-project-member-role';
import { toast } from '@/components/ui/toast';

// 権限変更 API と同じく、変更先は member・viewer に限定する。
const updateProjectMemberRoleSchema = z.object({
  role: z.enum([ProjectRole.Member, ProjectRole.Viewer], {
    error: '権限はメンバーまたは閲覧者を選択してください',
  }),
});
// Zod スキーマから、フォームの入力値の TypeScript 型を自動生成する。
type UpdateProjectMemberRoleFormValues = z.infer<
  typeof updateProjectMemberRoleSchema
>;

type UseProjectMemberRoleEditorOptions = {
  projectId: string;
  currentUserRole: ProjectRole;
  isArchived: boolean;
};

export function useProjectMemberRoleEditor({
  projectId,
  currentUserRole,
  isArchived,
}: UseProjectMemberRoleEditorOptions) {
  const router = useRouter();
  // 編集中のメンバーの ID。編集中でなければ null。
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  // 特定の入力欄に紐付かない API エラーを編集欄に表示する。
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateProjectMemberRoleFormValues>({
    resolver: zodResolver(updateProjectMemberRoleSchema),
    // 初回は送信時に検証し、送信後は入力変更時に再検証する。
    mode: 'onSubmit',
    defaultValues: {
      role: ProjectRole.Member,
    },
  });

  // PC・モバイルの選択欄に、同じフォームの値と変更処理を渡す。
  const { field: roleField } = useController({ control, name: 'role' });
  const canManageMembers = currentUserRole === ProjectRole.Owner;

  function handleEditRole(member: ProjectMember) {
    // 保存中は対象を切り替えず、変更できるメンバーだけをフォームに渡す。
    if (
      isSubmitting ||
      !canManageMembers ||
      isArchived ||
      member.role === ProjectRole.Owner
    ) {
      return;
    }

    reset({ role: member.role });
    setSubmitError(null);
    setEditingMemberId(member.id);
  }

  function handleCancelEdit() {
    // 閉じても保存は中断されないため、送信中は編集欄を閉じない。
    if (isSubmitting) {
      return;
    }

    reset();
    setSubmitError(null);
    setEditingMemberId(null);
  }

  const onSubmit = async (values: UpdateProjectMemberRoleFormValues) => {
    if (!canManageMembers || isArchived || editingMemberId === null) {
      return;
    }

    setSubmitError(null);

    try {
      await updateProjectMemberRole(projectId, editingMemberId, values);
    } catch (error) {
      // 404・409 は複数の理由があるため、status だけで原因を決めない。
      setSubmitError(
        error instanceof ProjectRequestError
          ? error.message
          : '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
      );
      return;
    }

    // 保存成功後の処理は API エラーの処理から分ける。
    toast.add({ type: 'success', title: 'メンバーの権限を変更しました' });
    reset();
    setEditingMemberId(null);
    router.refresh();
  };

  return {
    editingMemberId,
    editingRole: roleField.value,
    isSubmitting,
    roleError: errors.role?.message,
    submitError,
    handleEditRole,
    handleRoleChange: roleField.onChange,
    handleCancelEdit,
    handleSave: handleSubmit(onSubmit),
  };
}
