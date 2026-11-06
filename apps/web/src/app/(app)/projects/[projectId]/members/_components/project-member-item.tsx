import { UserRound } from 'lucide-react';
import type { SubmitEventHandler } from 'react';

import type { ProjectMember } from '../_lib/get-project-members';
import {
  ProjectRole,
  ProjectRoleDisplayText,
} from '@/features/projects/types/project-role';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/format-date';
import { ProjectMemberRoleEditor } from './project-member-role-editor';

type ProjectMemberItemProps = {
  member: ProjectMember;
  isCurrentUser: boolean;
  canManageMembers: boolean;
  isArchived: boolean;
  editingMemberId: string | null;
  editingRole: ProjectRole;
  onEdit: () => void;
  onDelete: () => void;
  onRoleChange: (role: ProjectRole) => void;
  onCancel: () => void;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  isSubmitting: boolean;
  isDeleting: boolean;
  roleError?: string;
  submitError: string | null;
};

const roleBadgeClassName = {
  [ProjectRole.Owner]: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  [ProjectRole.Member]: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  [ProjectRole.Viewer]: 'border-slate-200 bg-slate-50 text-slate-600',
} satisfies Record<ProjectRole, string>;

function MemberIdentity({
  name,
  isCurrentUser,
}: {
  name: string | null;
  isCurrentUser: boolean;
}) {
  const displayName = name?.trim() || '名前未設定';

  return (
    <div className="flex min-w-0 items-start gap-2">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs text-indigo-700"
      >
        {name?.trim() ? (
          Array.from(name.trim()).slice(0, 2).join('')
        ) : (
          <UserRound className="size-3.5" />
        )}
      </span>
      <p className="min-w-0 font-medium leading-6 wrap-anywhere">
        {displayName}
        {isCurrentUser && (
          <span className="ml-1 inline-block text-xs font-normal text-muted-foreground">
            （自分）
          </span>
        )}
      </p>
    </div>
  );
}

function RoleBadge({ role }: { role: ProjectRole }) {
  return (
    <Badge
      variant="outline"
      className={`rounded-sm ${roleBadgeClassName[role]}`}
    >
      {ProjectRoleDisplayText[role]}
    </Badge>
  );
}

export function ProjectMemberTableRow({
  member,
  isCurrentUser,
  canManageMembers,
  isArchived,
  editingMemberId,
  editingRole,
  onEdit,
  onDelete,
  onRoleChange,
  onCancel,
  onSubmit,
  isSubmitting,
  isDeleting,
  roleError,
  submitError,
}: ProjectMemberItemProps) {
  const canEditRole = canManageMembers && member.role !== ProjectRole.Owner;
  const isEditing = canEditRole && editingMemberId === member.id;

  return (
    <TableRow className="border-border">
      <TableCell className="whitespace-normal px-4 py-3">
        <MemberIdentity name={member.user.name} isCurrentUser={isCurrentUser} />
      </TableCell>
      <TableCell className="whitespace-normal px-4 py-3 text-xs text-muted-foreground wrap-anywhere">
        {member.user.email}
      </TableCell>
      <TableCell className="px-4 py-3">
        {isEditing ? (
          <ProjectMemberRoleEditor
            role={editingRole}
            onRoleChange={onRoleChange}
            onCancel={onCancel}
            isArchived={isArchived}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
            isDeleting={isDeleting}
            roleError={roleError}
            roleErrorId={`project-member-role-${member.id}-desktop-error`}
            submitError={submitError}
          />
        ) : (
          <RoleBadge role={member.role} />
        )}
      </TableCell>
      <TableCell className="px-4 py-3 text-xs text-muted-foreground">
        <time dateTime={member.createdAt}>{formatDate(member.createdAt)}</time>
      </TableCell>
      {canManageMembers && (
        <TableCell className="px-4 py-3">
          {canEditRole && !isEditing && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="link"
                size="sm"
                disabled={isArchived || isSubmitting || isDeleting}
                aria-describedby={
                  isArchived
                    ? 'project-member-actions-archived-description'
                    : undefined
                }
                onClick={onEdit}
                className="px-0 text-xs text-muted-foreground hover:text-indigo-600"
              >
                権限変更
              </Button>
              <Button
                type="button"
                variant="link"
                size="sm"
                disabled={isArchived || isSubmitting || isDeleting}
                aria-describedby={
                  isArchived
                    ? 'project-member-actions-archived-description'
                    : undefined
                }
                onClick={onDelete}
                className="px-0 text-xs text-destructive hover:text-destructive/80"
              >
                削除
              </Button>
            </div>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

export function ProjectMemberCard({
  member,
  isCurrentUser,
  canManageMembers,
  isArchived,
  editingMemberId,
  editingRole,
  onEdit,
  onDelete,
  onRoleChange,
  onCancel,
  onSubmit,
  isSubmitting,
  isDeleting,
  roleError,
  submitError,
}: ProjectMemberItemProps) {
  const canEditRole = canManageMembers && member.role !== ProjectRole.Owner;
  const isEditing = canEditRole && editingMemberId === member.id;

  return (
    <li className="px-4 py-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <MemberIdentity name={member.user.name} isCurrentUser={isCurrentUser} />
        {!isEditing && <RoleBadge role={member.role} />}
      </div>
      <p className="mt-1 pl-8 text-xs text-muted-foreground wrap-anywhere">
        {member.user.email}
      </p>
      <p className="mt-1 pl-8 text-xs text-muted-foreground">
        参加日{' '}
        <time dateTime={member.createdAt}>{formatDate(member.createdAt)}</time>
      </p>
      {isEditing ? (
        <div className="mt-3 rounded bg-slate-50 p-2">
          <ProjectMemberRoleEditor
            role={editingRole}
            onRoleChange={onRoleChange}
            onCancel={onCancel}
            isArchived={isArchived}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
            isDeleting={isDeleting}
            roleError={roleError}
            roleErrorId={`project-member-role-${member.id}-mobile-error`}
            submitError={submitError}
          />
        </div>
      ) : canEditRole ? (
        <div className="mt-3 flex justify-end border-t border-border pt-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={isArchived || isSubmitting || isDeleting}
            aria-describedby={
              isArchived
                ? 'project-member-actions-archived-description'
                : undefined
            }
            onClick={onEdit}
            className="h-10 px-3 text-xs text-muted-foreground hover:text-indigo-600"
          >
            権限変更
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={isArchived || isSubmitting || isDeleting}
            aria-describedby={
              isArchived
                ? 'project-member-actions-archived-description'
                : undefined
            }
            onClick={onDelete}
            className="h-10 px-3 text-xs text-destructive hover:text-destructive/80"
          >
            削除
          </Button>
        </div>
      ) : null}
    </li>
  );
}
