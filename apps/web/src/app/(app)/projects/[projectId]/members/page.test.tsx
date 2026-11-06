import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetail } from '../_lib/get-project';
import type { ProjectMember } from './_lib/get-project-members';
import { ProjectRole } from '@/features/projects/types/project-role';
import type { CurrentUser } from '@/lib/auth/get-current-user';
import ProjectMembersPage from './page';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getProjectMembers: vi.fn(),
  createClient: vi.fn(),
  getSession: vi.fn(),
  getCurrentUser: vi.fn(),
  refresh: vi.fn(),
  updateProjectMemberRole: vi.fn(),
  toastAdd: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('../_lib/get-project', () => ({
  getProject: mocks.getProject,
}));

vi.mock('./_lib/get-project-members', () => ({
  getProjectMembers: mocks.getProjectMembers,
}));

vi.mock('./_lib/update-project-member-role', () => ({
  updateProjectMemberRole: mocks.updateProjectMemberRole,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.toastAdd },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const project: ProjectDetail = {
  id: 'project-id',
  key: 'TEST',
  name: '取得したプロジェクト',
  description: null,
  isArchived: false,
  createdAt: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-10-18T00:00:00.000Z',
  currentUserRole: ProjectRole.Owner,
};

const members: ProjectMember[] = [
  {
    id: 'membership-owner',
    userId: 'user-owner',
    role: ProjectRole.Owner,
    createdAt: '2026-10-18T00:00:00.000Z',
    user: { name: '取得したメンバー', email: 'owner@example.com' },
  },
];

const editableMember: ProjectMember = {
  id: 'membership-member',
  userId: 'user-member',
  role: ProjectRole.Member,
  createdAt: '2026-10-18T00:00:00.000Z',
  user: { name: '権限変更の対象', email: 'member@example.com' },
};

const currentUser: CurrentUser = {
  id: 'user-owner',
  email: 'owner@example.com',
  name: '取得したメンバー',
  createdAt: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-10-18T00:00:00.000Z',
};

async function renderPage() {
  return render(
    await ProjectMembersPage({
      params: Promise.resolve({ projectId: project.id }),
    }),
  );
}

describe('ProjectMembersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue(project);
    mocks.getProjectMembers.mockResolvedValue(members);
    mocks.createClient.mockResolvedValue({
      auth: { getSession: mocks.getSession },
    });
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: null,
    });
    mocks.getCurrentUser.mockResolvedValue(currentUser);
    mocks.updateProjectMemberRole.mockReset().mockResolvedValue({
      ...editableMember,
      role: ProjectRole.Viewer,
    });
  });

  it('取得したProjectのヘッダー・共通ナビゲーション・メンバーを表示する', async () => {
    await renderPage();

    expect(mocks.getProject).toHaveBeenCalledWith(project.id);
    expect(mocks.getProjectMembers).toHaveBeenCalledWith(project.id);
    expect(mocks.getCurrentUser).toHaveBeenCalledWith('test-access-token');
    expect(
      screen.getByRole('heading', { name: project.name, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'メンバー' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute(
      'href',
      '/projects/project-id/setting',
    );

    const table = screen.getByRole('table', {
      name: 'プロジェクトメンバー一覧',
    });
    expect(within(table).getByText('取得したメンバー')).toBeInTheDocument();
    expect(within(table).getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByText('1名')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'メンバーを追加' }),
    ).toBeEnabled();
  });

  it('本人のUser.idに対応する行だけにPC・モバイルで「（自分）」を表示する', async () => {
    mocks.getProject.mockResolvedValue({
      ...project,
      currentUserRole: ProjectRole.Member,
    });
    mocks.getProjectMembers.mockResolvedValue([
      ...members,
      {
        id: 'membership-member',
        userId: 'user-member',
        role: ProjectRole.Member,
        createdAt: '2026-10-18T00:00:00.000Z',
        user: { name: 'ログイン中のメンバー', email: 'member@example.com' },
      },
    ]);
    mocks.getCurrentUser.mockResolvedValue({
      ...currentUser,
      id: 'user-member',
      name: 'ログイン中のメンバー',
      email: 'member@example.com',
    });

    await renderPage();

    const table = screen.getByRole('table', {
      name: 'プロジェクトメンバー一覧',
    });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]).queryByText('（自分）')).not.toBeInTheDocument();
    expect(within(rows[1]).getByText('（自分）')).toBeInTheDocument();
    expect(within(table).getAllByText('（自分）')).toHaveLength(1);

    const list = screen.getByRole('list', {
      name: 'プロジェクトメンバー一覧（モバイル）',
    });
    const items = within(list).getAllByRole('listitem');
    expect(within(items[0]).queryByText('（自分）')).not.toBeInTheDocument();
    expect(within(items[1]).getByText('（自分）')).toBeInTheDocument();
    expect(within(list).getAllByText('（自分）')).toHaveLength(1);
  });

  it('ownerのページではowner以外のメンバーに権限変更・削除ボタンを表示する', async () => {
    mocks.getProjectMembers.mockResolvedValue([...members, editableMember]);

    await renderPage();

    const table = screen.getByRole('table', {
      name: 'プロジェクトメンバー一覧',
    });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(
      within(rows[0]).queryByRole('button', { name: '権限変更' }),
    ).not.toBeInTheDocument();
    expect(
      within(rows[1]).getByRole('button', { name: '権限変更' }),
    ).toBeEnabled();
    expect(
      within(rows[0]).queryByRole('button', { name: '削除' }),
    ).not.toBeInTheDocument();
    expect(within(rows[1]).getByRole('button', { name: '削除' })).toBeEnabled();
    const list = screen.getByRole('list', {
      name: 'プロジェクトメンバー一覧（モバイル）',
    });
    expect(
      within(list).getByRole('button', { name: '権限変更' }),
    ).toBeEnabled();
    expect(within(list).getByRole('button', { name: '削除' })).toBeEnabled();
  });

  it('ページから取得済みのProject.idをListへ渡し、対象メンバーの権限を保存する', async () => {
    mocks.getProjectMembers.mockResolvedValue([...members, editableMember]);
    const user = userEvent.setup();
    await renderPage();

    const table = screen.getByRole('table', {
      name: 'プロジェクトメンバー一覧',
    });
    const row = within(table).getAllByRole('row')[2];
    await user.click(within(row).getByRole('button', { name: '権限変更' }));
    await user.selectOptions(
      within(row).getByRole('combobox'),
      ProjectRole.Viewer,
    );
    await user.click(within(row).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.updateProjectMemberRole).toHaveBeenCalledExactlyOnceWith(
      project.id,
      editableMember.id,
      { role: ProjectRole.Viewer },
    );
  });

  it.each([ProjectRole.Member, ProjectRole.Viewer])(
    '%sもメンバーページを表示でき、設定リンクは表示しない',
    async (currentUserRole) => {
      mocks.getProject.mockResolvedValue({ ...project, currentUserRole });
      mocks.getProjectMembers.mockResolvedValue([...members, editableMember]);

      await renderPage();

      expect(
        screen.getByRole('heading', { name: 'プロジェクトメンバー' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'タスク' })).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: '設定' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'メンバーを追加' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '権限変更' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '削除' }),
      ).not.toBeInTheDocument();
    },
  );

  it('アーカイブ済みでも一覧を表示し、ownerの追加・権限変更・削除のボタンを無効にする', async () => {
    mocks.getProject.mockResolvedValue({ ...project, isArchived: true });
    mocks.getProjectMembers.mockResolvedValue([...members, editableMember]);

    await renderPage();

    expect(
      screen.getByRole('table', { name: 'プロジェクトメンバー一覧' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'メンバーを追加' }),
    ).toBeDisabled();
    expect(
      screen.getByText('アーカイブ済みのため、メンバーを追加できません。'),
    ).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', {
      name: /^(権限変更|削除)$/,
    })) {
      expect(button).toBeDisabled();
    }
  });

  it('Projectが存在しない、または非参加の場合はnotFoundを呼ぶ', async () => {
    mocks.getProject.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.getProjectMembers).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it('メンバー取得がnullの場合はnotFoundを呼ぶ', async () => {
    mocks.getProjectMembers.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.getProjectMembers).toHaveBeenCalledWith(project.id);
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it('メンバーが空配列の場合は404にせず空の案内を表示する', async () => {
    mocks.getProjectMembers.mockResolvedValue([]);

    await renderPage();

    expect(screen.getByText('0名')).toBeInTheDocument();
    expect(screen.getByText('メンバーはいません。')).toBeInTheDocument();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('セッションがない場合は本人情報を取得せずエラーにする', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(renderPage()).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('セッション取得でエラーがある場合は本人情報を取得しない', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-access-token' } },
      error: new Error('セッション取得エラー'),
    });

    await expect(renderPage()).rejects.toThrow(
      'ログインセッションを取得できませんでした。',
    );
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('本人情報の取得失敗を404にせずエラーとして伝える', async () => {
    const error = new Error('ユーザー情報の取得に失敗しました。');
    mocks.getCurrentUser.mockRejectedValue(error);

    await expect(renderPage()).rejects.toBe(error);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
