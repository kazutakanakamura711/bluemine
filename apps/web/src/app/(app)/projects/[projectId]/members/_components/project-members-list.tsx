'use client';

import type { ReactNode, SubmitEventHandler } from 'react';

import type { ProjectMember } from '../_lib/get-project-members';
import { ProjectRole } from '@/features/projects/types/project-role';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useDeleteProjectMemberDialog } from '../_lib/use-delete-project-member-dialog';
import { useProjectMemberRoleEditor } from '../_lib/use-project-member-role-editor';
import {
  ProjectMemberCard,
  ProjectMemberTableRow,
} from './project-member-item';
import { DeleteProjectMemberDialog } from './delete-project-member-dialog';

type ProjectMembersListProps = {
  projectId: string;
  members: ProjectMember[];
  currentUserId?: string;
  currentUserRole: ProjectRole;
  isArchived: boolean;
  headerAction?: ReactNode;
};

export function ProjectMembersList({
  projectId,
  members,
  currentUserId,
  currentUserRole,
  isArchived,
  headerAction,
}: ProjectMembersListProps) {
  // 各 Hook を1回ずつ呼び、PC・モバイルで同じ状態を共有する。
  const roleEditor = useProjectMemberRoleEditor({
    projectId,
    currentUserRole,
    isArchived,
  });
  const deleteDialog = useDeleteProjectMemberDialog({
    projectId,
    currentUserRole,
    isArchived,
  });
  const canManageMembers = currentUserRole === ProjectRole.Owner;

  // 操作同士の送信中の制御は、両方の状態が分かる List で行う。
  function handleEditRole(member: ProjectMember) {
    if (deleteDialog.isDeleting) {
      return;
    }
    roleEditor.handleEditRole(member);
  }

  function handleCancelEdit() {
    if (deleteDialog.isDeleting) {
      return;
    }
    roleEditor.handleCancelEdit();
  }

  const handleSave: SubmitEventHandler<HTMLFormElement> = (event) => {
    if (deleteDialog.isDeleting) {
      event.preventDefault();
      return;
    }
    return roleEditor.handleSave(event);
  };

  function handleOpenDeleteDialog(member: ProjectMember) {
    if (roleEditor.isSubmitting) {
      return;
    }
    deleteDialog.handleOpenDeleteDialog(member);
  }

  function handleDeleteMember() {
    if (roleEditor.isSubmitting) {
      return;
    }
    return deleteDialog.handleDeleteMember();
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-sm font-semibold">プロジェクトメンバー</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {members.length}名
          </p>
        </div>
        {headerAction}
      </div>

      {canManageMembers && isArchived && (
        <p
          id="project-member-actions-archived-description"
          className="border-b border-border px-4 py-3 text-xs text-muted-foreground sm:px-5"
        >
          アーカイブ済みのため、メンバーの権限変更・削除はできません。
        </p>
      )}

      {members.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          メンバーはいません。
        </p>
      ) : (
        <>
          <div className="hidden md:block">
            <Table
              aria-label="プロジェクトメンバー一覧"
              className="table-fixed"
            >
              <TableHeader>
                <TableRow className="border-border bg-slate-50 hover:bg-slate-50">
                  <TableHead
                    className={`${canManageMembers ? 'w-[24%]' : 'w-[30%]'} px-4 text-xs text-muted-foreground`}
                  >
                    名前
                  </TableHead>
                  <TableHead className="px-4 text-xs text-muted-foreground">
                    メールアドレス
                  </TableHead>
                  <TableHead
                    className={`${canManageMembers ? 'w-52' : 'w-28'} px-4 text-xs text-muted-foreground`}
                  >
                    権限
                  </TableHead>
                  <TableHead className="w-28 px-4 text-xs text-muted-foreground">
                    参加日
                  </TableHead>
                  {canManageMembers && (
                    <TableHead className="w-28 px-4 text-xs text-muted-foreground">
                      操作
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <ProjectMemberTableRow
                    key={member.id}
                    member={member}
                    isCurrentUser={member.userId === currentUserId}
                    canManageMembers={canManageMembers}
                    isArchived={isArchived}
                    editingMemberId={roleEditor.editingMemberId}
                    editingRole={roleEditor.editingRole}
                    onEdit={() => handleEditRole(member)}
                    onRoleChange={roleEditor.handleRoleChange}
                    onCancel={handleCancelEdit}
                    onSubmit={handleSave}
                    isSubmitting={roleEditor.isSubmitting}
                    isDeleting={deleteDialog.isDeleting}
                    roleError={roleEditor.roleError}
                    submitError={roleEditor.submitError}
                    onDelete={() => handleOpenDeleteDialog(member)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <ul
            aria-label="プロジェクトメンバー一覧（モバイル）"
            className="divide-y divide-border md:hidden"
          >
            {members.map((member) => (
              <ProjectMemberCard
                key={member.id}
                member={member}
                isCurrentUser={member.userId === currentUserId}
                canManageMembers={canManageMembers}
                isArchived={isArchived}
                editingMemberId={roleEditor.editingMemberId}
                editingRole={roleEditor.editingRole}
                onEdit={() => handleEditRole(member)}
                onDelete={() => handleOpenDeleteDialog(member)}
                onRoleChange={roleEditor.handleRoleChange}
                onCancel={handleCancelEdit}
                onSubmit={handleSave}
                isSubmitting={roleEditor.isSubmitting}
                isDeleting={deleteDialog.isDeleting}
                roleError={roleEditor.roleError}
                submitError={roleEditor.submitError}
              />
            ))}
          </ul>
        </>
      )}
      <DeleteProjectMemberDialog
        isOpen={deleteDialog.isDeleteDialogOpen}
        memberName={deleteDialog.memberToDelete?.user.name ?? null}
        memberEmail={deleteDialog.memberToDelete?.user.email ?? ''}
        isDeleting={deleteDialog.isDeleting}
        deleteError={deleteDialog.deleteError}
        onClose={deleteDialog.handleCloseDeleteDialog}
        onDelete={handleDeleteMember}
      />
    </section>
  );
}
