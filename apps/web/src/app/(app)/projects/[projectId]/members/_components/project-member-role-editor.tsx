import type { SubmitEventHandler } from 'react';

import {
  ProjectRole,
  ProjectRoleDisplayText,
} from '@/features/projects/types/project-role';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function ProjectMemberRoleEditor({
  role,
  onRoleChange,
  onCancel,
  isArchived,
  onSubmit,
  isSubmitting,
  isDeleting,
  roleError,
  roleErrorId,
  submitError,
}: {
  role: ProjectRole;
  onRoleChange: (role: ProjectRole) => void;
  onCancel: () => void;
  isArchived: boolean;
  onSubmit: SubmitEventHandler<HTMLFormElement>;
  isSubmitting: boolean;
  isDeleting: boolean;
  roleError?: string;
  roleErrorId: string;
  submitError: string | null;
}) {
  return (
    <form
      noValidate
      aria-label="メンバーの権限変更"
      aria-busy={isSubmitting}
      onSubmit={onSubmit}
      className="min-w-0 space-y-2"
    >
      {submitError && (
        <Alert variant="destructive">
          <AlertDescription className="wrap-anywhere">
            {submitError}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex min-w-0 items-center gap-1">
        <select
          aria-label="変更後の権限"
          name="role"
          required
          aria-invalid={Boolean(roleError)}
          aria-describedby={roleError ? roleErrorId : undefined}
          value={role}
          onChange={(event) => onRoleChange(event.target.value as ProjectRole)}
          disabled={isArchived || isSubmitting || isDeleting}
          className="h-10 min-w-0 flex-1 rounded border border-input bg-background px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:h-7 md:w-24 md:flex-none md:text-xs"
        >
          <option value={ProjectRole.Member}>
            {ProjectRoleDisplayText[ProjectRole.Member]}
          </option>
          <option value={ProjectRole.Viewer}>
            {ProjectRoleDisplayText[ProjectRole.Viewer]}
          </option>
        </select>
        <Button
          type="submit"
          variant="link"
          size="sm"
          disabled={isArchived || isSubmitting || isDeleting}
          className="h-10 px-2 text-xs text-indigo-600 md:h-7 md:px-0"
        >
          {isSubmitting ? '保存中...' : '保存'}
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting || isDeleting}
          className="h-10 px-2 text-xs text-muted-foreground md:h-7 md:px-0"
        >
          取消
        </Button>
      </div>
      {roleError && (
        <p id={roleErrorId} role="alert" className="text-xs text-destructive">
          {roleError}
        </p>
      )}
    </form>
  );
}
