import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { deleteProjectMember } from './delete-project-member';
import type { ProjectMember } from './get-project-members';
import { ProjectRole } from '@/features/projects/types/project-role';
import { useDeleteProjectMemberDialog } from './use-delete-project-member-dialog';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), toastAdd: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toastAdd },
}));

vi.mock('./delete-project-member', () => ({
  deleteProjectMember: vi.fn(),
}));

const member: ProjectMember = {
  id: 'membership-member',
  userId: 'user-member',
  role: ProjectRole.Member,
  createdAt: '2026-10-21T00:00:00.000Z',
  user: { name: '佐藤 花子', email: 'member@example.test' },
};

const options = {
  projectId: 'project-id',
  currentUserRole: ProjectRole.Owner,
  isArchived: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteProjectMember).mockReset().mockResolvedValue(undefined);
});

describe('useDeleteProjectMemberDialog', () => {
  it('対象を選んで開き、閉じる間は表示内容を保持して次の対象へ切り替えられる', () => {
    const { result } = renderHook(() => useDeleteProjectMemberDialog(options));
    expect(result.current.memberToDelete).toBeNull();
    expect(result.current.isDeleteDialogOpen).toBe(false);
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.deleteError).toBeNull();

    act(() => result.current.handleOpenDeleteDialog(member));
    expect(result.current.memberToDelete).toEqual(member);
    expect(result.current.isDeleteDialogOpen).toBe(true);
    act(() => result.current.handleCloseDeleteDialog(true));
    expect(result.current.isDeleteDialogOpen).toBe(true);
    act(() => result.current.handleCloseDeleteDialog(false));
    expect(result.current.isDeleteDialogOpen).toBe(false);
    expect(result.current.memberToDelete).toEqual(member);

    const viewer = {
      ...member,
      id: 'membership-viewer',
      role: ProjectRole.Viewer,
    };
    act(() => result.current.handleOpenDeleteDialog(viewer));
    expect(result.current.memberToDelete).toEqual(viewer);
    expect(result.current.isDeleteDialogOpen).toBe(true);
    expect(deleteProjectMember).not.toHaveBeenCalled();
  });

  it.each([
    {
      currentUserRole: ProjectRole.Member,
      isArchived: false,
      targetRole: ProjectRole.Member,
    },
    {
      currentUserRole: ProjectRole.Viewer,
      isArchived: false,
      targetRole: ProjectRole.Member,
    },
    {
      currentUserRole: ProjectRole.Owner,
      isArchived: true,
      targetRole: ProjectRole.Member,
    },
    {
      currentUserRole: ProjectRole.Owner,
      isArchived: false,
      targetRole: ProjectRole.Owner,
    },
  ])(
    '$currentUserRole / archived=$isArchived / 対象=$targetRole では開かず、削除しない',
    async ({ currentUserRole, isArchived, targetRole }) => {
      const { result } = renderHook(() =>
        useDeleteProjectMemberDialog({
          ...options,
          currentUserRole,
          isArchived,
        }),
      );
      act(() =>
        result.current.handleOpenDeleteDialog({ ...member, role: targetRole }),
      );
      await act(async () => result.current.handleDeleteMember());
      expect(result.current.memberToDelete).toBeNull();
      expect(result.current.isDeleteDialogOpen).toBe(false);
      expect(deleteProjectMember).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );

  it.each([
    { currentUserRole: ProjectRole.Member, isArchived: false },
    { currentUserRole: ProjectRole.Viewer, isArchived: false },
    { currentUserRole: ProjectRole.Owner, isArchived: true },
  ])(
    '確認後に権限・アーカイブ状態が $currentUserRole / $isArchived に変わった場合は送信しない',
    async (nextProps) => {
      const { result, rerender } = renderHook(
        (props) =>
          useDeleteProjectMemberDialog({ projectId: 'project-id', ...props }),
        {
          initialProps: {
            currentUserRole: ProjectRole.Owner as ProjectRole,
            isArchived: false,
          },
        },
      );
      act(() => result.current.handleOpenDeleteDialog(member));
      rerender(nextProps);
      await act(async () => result.current.handleDeleteMember());

      expect(deleteProjectMember).not.toHaveBeenCalled();
      expect(result.current.isDeleting).toBe(false);
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );

  it('対象を選ぶ前や確認を閉じた後は削除しない', async () => {
    const { result } = renderHook(() => useDeleteProjectMemberDialog(options));
    await act(async () => result.current.handleDeleteMember());
    act(() => result.current.handleOpenDeleteDialog(member));
    act(() => result.current.handleCloseDeleteDialog(false));
    await act(async () => result.current.handleDeleteMember());
    expect(deleteProjectMember).not.toHaveBeenCalled();
    expect(result.current.isDeleting).toBe(false);
  });

  it('ProjectMember.idを削除APIに渡し、成功時に通知・閉鎖・一覧再取得を行う', async () => {
    const { result } = renderHook(() => useDeleteProjectMemberDialog(options));
    act(() => result.current.handleOpenDeleteDialog(member));
    await act(async () => result.current.handleDeleteMember());

    expect(deleteProjectMember).toHaveBeenCalledExactlyOnceWith(
      'project-id',
      member.id,
    );
    expect(result.current.isDeleteDialogOpen).toBe(false);
    expect(result.current.memberToDelete).toEqual(member);
    expect(result.current.isDeleting).toBe(false);
    expect(mocks.toastAdd).toHaveBeenCalledExactlyOnceWith({
      type: 'success',
      title: 'メンバーを削除しました',
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('削除中は再送信・対象変更・閉じる操作を受け付けない', async () => {
    let resolveRequest!: () => void;
    vi.mocked(deleteProjectMember).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const { result } = renderHook(() => useDeleteProjectMemberDialog(options));
    act(() => result.current.handleOpenDeleteDialog(member));
    let deletePromise!: Promise<void>;
    await act(async () => {
      deletePromise = result.current.handleDeleteMember();
    });
    expect(result.current.isDeleting).toBe(true);
    act(() =>
      result.current.handleOpenDeleteDialog({
        ...member,
        id: 'another-member',
      }),
    );
    act(() => result.current.handleCloseDeleteDialog(false));
    await act(async () => result.current.handleDeleteMember());
    expect(result.current.memberToDelete).toEqual(member);
    expect(result.current.isDeleteDialogOpen).toBe(true);
    expect(deleteProjectMember).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.toastAdd).not.toHaveBeenCalled();

    await act(async () => {
      resolveRequest();
      await deletePromise;
    });
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.isDeleteDialogOpen).toBe(false);
  });

  it.each([
    [404, 'プロジェクトが見つかりません'],
    [404, '削除対象のメンバーが見つかりません'],
    [409, 'アーカイブ済みのプロジェクトではメンバーを削除できません'],
    [409, 'owner は削除できません'],
  ])(
    '%iの業務エラー「%s」を表示し、対象を保持して再試行できる',
    async (status, message) => {
      vi.mocked(deleteProjectMember).mockRejectedValueOnce(
        new ProjectRequestError(message, status),
      );
      const { result } = renderHook(() =>
        useDeleteProjectMemberDialog(options),
      );
      act(() => result.current.handleOpenDeleteDialog(member));
      await act(async () => result.current.handleDeleteMember());

      expect(result.current.deleteError).toBe(message);
      expect(result.current.isDeleting).toBe(false);
      expect(result.current.isDeleteDialogOpen).toBe(true);
      expect(result.current.memberToDelete).toEqual(member);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.toastAdd).not.toHaveBeenCalled();

      await act(async () => result.current.handleDeleteMember());
      expect(result.current.deleteError).toBeNull();
      expect(result.current.isDeleteDialogOpen).toBe(false);
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it('通信失敗では固定の案内を表示し、閉じて次の対象を開くとエラーを消す', async () => {
    vi.mocked(deleteProjectMember).mockRejectedValue(
      new TypeError('internal error'),
    );
    const { result } = renderHook(() => useDeleteProjectMemberDialog(options));
    act(() => result.current.handleOpenDeleteDialog(member));
    await act(async () => result.current.handleDeleteMember());
    expect(result.current.deleteError).toBe(
      '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
    );
    act(() => result.current.handleCloseDeleteDialog(false));
    expect(result.current.deleteError).toBeNull();
    act(() =>
      result.current.handleOpenDeleteDialog({
        ...member,
        id: 'another-member',
      }),
    );
    expect(result.current.deleteError).toBeNull();
    expect(result.current.isDeleteDialogOpen).toBe(true);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
