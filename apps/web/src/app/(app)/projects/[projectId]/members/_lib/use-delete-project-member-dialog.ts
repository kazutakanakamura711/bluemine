import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { deleteProjectMember } from './delete-project-member';
import type { ProjectMember } from './get-project-members';
import { ProjectRole } from '@/features/projects/types/project-role';
import { toast } from '@/components/ui/toast';

type UseDeleteProjectMemberDialogOptions = {
  projectId: string;
  currentUserRole: ProjectRole;
  isArchived: boolean;
};

export function useDeleteProjectMemberDialog({
  projectId,
  currentUserRole,
  isArchived,
}: UseDeleteProjectMemberDialogOptions) {
  const router = useRouter();
  // 削除確認に表示する対象。閉じるアニメーション中も表示が消えないよう、対象と開閉状態は別々に管理。
  const [memberToDelete, setMemberToDelete] = useState<ProjectMember | null>(
    null,
  );
  // メンバーの削除モーダルの開閉管理。
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  // メンバーの削除を実行中かどうかの管理。
  const [isDeleting, setIsDeleting] = useState(false);
  // メンバー削除時に表示するエラーメッセージ。
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canManageMembers = currentUserRole === ProjectRole.Owner;

  function handleOpenDeleteDialog(member: ProjectMember) {
    if (
      isDeleting ||
      !canManageMembers ||
      isArchived ||
      member.role === ProjectRole.Owner
    ) {
      return;
    }

    setMemberToDelete(member);
    setDeleteError(null);
    setIsDeleteDialogOpen(true);
  }

  function handleCloseDeleteDialog(open: boolean) {
    // 閉じても削除は中断されないため、送信中は Escape キーでも閉じない。
    if (open || isDeleting) {
      return;
    }

    setIsDeleteDialogOpen(false);
    setDeleteError(null);
  }

  async function handleDeleteMember() {
    if (
      isDeleting ||
      !canManageMembers ||
      isArchived ||
      !isDeleteDialogOpen ||
      memberToDelete === null ||
      memberToDelete.role === ProjectRole.Owner
    ) {
      return;
    }

    setDeleteError(null);
    setIsDeleting(true);

    try {
      // User.id ではなく、一覧で選択した ProjectMember.id を渡す。
      await deleteProjectMember(projectId, memberToDelete.id);
    } catch (error) {
      // 404・409 は複数の理由があるため、status だけで原因を決めない。
      setDeleteError(
        error instanceof ProjectRequestError
          ? error.message
          : '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
      );
      return;
    } finally {
      setIsDeleting(false);
    }

    // 成功後の処理は API エラーの処理から分ける。
    toast.add({ type: 'success', title: 'メンバーを削除しました' });
    setIsDeleteDialogOpen(false);
    router.refresh();
  }

  return {
    memberToDelete,
    isDeleteDialogOpen,
    isDeleting,
    deleteError,
    handleOpenDeleteDialog,
    handleCloseDeleteDialog,
    handleDeleteMember,
  };
}
