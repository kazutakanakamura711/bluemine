import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import type { ProjectMember } from './get-project-members';
import { ProjectRole } from '@/features/projects/types/project-role';
import { updateProjectMemberRole } from './update-project-member-role';
import { useProjectMemberRoleEditor } from './use-project-member-role-editor';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), toastAdd: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toastAdd },
}));

vi.mock('./update-project-member-role', () => ({
  updateProjectMemberRole: vi.fn(),
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
  vi.mocked(updateProjectMemberRole).mockReset().mockResolvedValue(member);
});

describe('useProjectMemberRoleEditor', () => {
  it('対象の権限を初期選択し、取消と対象変更で入力を初期化する', async () => {
    const { result } = renderHook(() => useProjectMemberRoleEditor(options));
    expect(result.current.editingMemberId).toBeNull();
    expect(result.current.submitError).toBeNull();
    act(() => result.current.handleEditRole(member));
    expect(result.current.editingMemberId).toBe(member.id);
    expect(result.current.editingRole).toBe(ProjectRole.Member);

    await act(async () => result.current.handleRoleChange(ProjectRole.Viewer));
    act(() => result.current.handleCancelEdit());
    expect(result.current.editingMemberId).toBeNull();
    act(() => result.current.handleEditRole(member));
    expect(result.current.editingRole).toBe(ProjectRole.Member);

    const viewer = {
      ...member,
      id: 'membership-viewer',
      role: ProjectRole.Viewer,
    };
    act(() => result.current.handleEditRole(viewer));
    expect(result.current.editingMemberId).toBe(viewer.id);
    expect(result.current.editingRole).toBe(ProjectRole.Viewer);
    expect(updateProjectMemberRole).not.toHaveBeenCalled();
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
    '$currentUserRole / archived=$isArchived / 対象=$targetRole では編集・保存しない',
    async ({ currentUserRole, isArchived, targetRole }) => {
      const { result } = renderHook(() =>
        useProjectMemberRoleEditor({
          ...options,
          currentUserRole,
          isArchived,
        }),
      );
      act(() => result.current.handleEditRole({ ...member, role: targetRole }));
      await act(async () => result.current.handleSave());

      expect(result.current.editingMemberId).toBeNull();
      expect(updateProjectMemberRole).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.toastAdd).not.toHaveBeenCalled();
    },
  );

  it('送信時に不正な権限を拒否し、修正後はProjectMember.idで保存・通知・再取得する', async () => {
    const { result } = renderHook(() => useProjectMemberRoleEditor(options));
    act(() => result.current.handleEditRole(member));
    await act(async () => result.current.handleRoleChange(ProjectRole.Owner));
    expect(result.current.roleError).toBeUndefined();
    await act(async () => result.current.handleSave());
    expect(result.current.roleError).toBe(
      '権限はメンバーまたは閲覧者を選択してください',
    );
    expect(updateProjectMemberRole).not.toHaveBeenCalled();

    await act(async () => result.current.handleRoleChange(ProjectRole.Viewer));
    expect(result.current.roleError).toBeUndefined();
    await act(async () => result.current.handleSave());

    expect(updateProjectMemberRole).toHaveBeenCalledExactlyOnceWith(
      'project-id',
      member.id,
      { role: ProjectRole.Viewer },
    );
    expect(result.current.editingMemberId).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
    expect(mocks.toastAdd).toHaveBeenCalledExactlyOnceWith({
      type: 'success',
      title: 'メンバーの権限を変更しました',
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('保存中は対象変更・取消を受け付けない', async () => {
    let resolveRequest!: (member: ProjectMember) => void;
    vi.mocked(updateProjectMemberRole).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const { result } = renderHook(() => useProjectMemberRoleEditor(options));
    act(() => result.current.handleEditRole(member));
    let savePromise!: Promise<void>;
    await act(async () => {
      savePromise = result.current.handleSave();
    });
    expect(result.current.isSubmitting).toBe(true);
    act(() =>
      result.current.handleEditRole({ ...member, id: 'another-member' }),
    );
    act(() => result.current.handleCancelEdit());
    expect(result.current.editingMemberId).toBe(member.id);
    expect(mocks.refresh).not.toHaveBeenCalled();

    await act(async () => {
      resolveRequest(member);
      await savePromise;
    });
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.editingMemberId).toBeNull();
  });

  it.each([
    [404, '変更対象のメンバーが見つかりません'],
    [409, 'アーカイブ済みのプロジェクトではメンバーの role を変更できません'],
  ])(
    '%iの業務エラーを表示し、対象・選択を保持して再試行できる',
    async (status, message) => {
      vi.mocked(updateProjectMemberRole).mockRejectedValueOnce(
        new ProjectRequestError(message, status),
      );
      const { result } = renderHook(() => useProjectMemberRoleEditor(options));
      act(() => result.current.handleEditRole(member));
      await act(async () =>
        result.current.handleRoleChange(ProjectRole.Viewer),
      );
      await act(async () => result.current.handleSave());

      expect(result.current.submitError).toBe(message);
      expect(result.current.editingMemberId).toBe(member.id);
      expect(result.current.editingRole).toBe(ProjectRole.Viewer);
      expect(result.current.isSubmitting).toBe(false);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.toastAdd).not.toHaveBeenCalled();

      await act(async () => result.current.handleSave());
      expect(result.current.submitError).toBeNull();
      expect(result.current.editingMemberId).toBeNull();
      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it('通信失敗では固定の案内を表示し、取消でエラーを消す', async () => {
    vi.mocked(updateProjectMemberRole).mockRejectedValue(
      new TypeError('internal error'),
    );
    const { result } = renderHook(() => useProjectMemberRoleEditor(options));
    act(() => result.current.handleEditRole(member));
    await act(async () => result.current.handleSave());
    expect(result.current.submitError).toBe(
      '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
    );
    act(() => result.current.handleCancelEdit());
    expect(result.current.submitError).toBeNull();
    expect(result.current.editingMemberId).toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
