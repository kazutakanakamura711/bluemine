import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetail } from '../../_lib/get-project';
import { ProjectRole } from '@/features/projects/types/project-role';
import NewTaskPage from './page';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getProjectMembers: vi.fn(),
  getCurrentUser: vi.fn(),
  getSession: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../../_lib/get-project', () => ({ getProject: mocks.getProject }));
vi.mock('../../members/_lib/get-project-members', () => ({
  getProjectMembers: mocks.getProjectMembers,
}));
vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getSession: mocks.getSession } }),
}));
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

const project: ProjectDetail = {
  id: 'project-1',
  name: 'Task Management App',
  key: 'APP',
  description: null,
  isArchived: false,
  currentUserRole: ProjectRole.Owner,
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
};

async function renderPage() {
  return render(
    await NewTaskPage({ params: Promise.resolve({ projectId: project.id }) }),
  );
}

describe('NewTaskPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue(project);
    mocks.getProjectMembers.mockResolvedValue([
      {
        id: 'membership-1',
        userId: 'user-1',
        role: ProjectRole.Owner,
        user: { name: '山田太郎', email: 'owner@example.test' },
      },
      {
        id: 'membership-2',
        userId: 'user-2',
        role: ProjectRole.Viewer,
        user: { name: null, email: 'viewer@example.test' },
      },
    ]);
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
      error: null,
    });
    mocks.getCurrentUser.mockResolvedValue({
      id: 'user-1',
      name: '山田太郎',
      email: 'owner@example.test',
    });
  });

  it('Projectが存在しない・非参加の場合は404とし、メンバー・本人情報を取得しない', async () => {
    mocks.getProject.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.getProjectMembers).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it('メンバー取得の404も、別のデータで補わず404とする', async () => {
    mocks.getProjectMembers.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it.each([ProjectRole.Owner, ProjectRole.Member])(
    '%sには認証済み本人と参加者の表示情報を渡す',
    async (role) => {
      mocks.getProject.mockResolvedValue({ ...project, currentUserRole: role });
      await renderPage();
      expect(mocks.getProjectMembers).toHaveBeenCalledExactlyOnceWith(
        project.id,
      );
      expect(mocks.getCurrentUser).toHaveBeenCalledExactlyOnceWith(
        'test-token',
      );
      expect(
        within(screen.getByRole('group', { name: '報告者' })).getByText(
          '山田太郎',
        ),
      ).toBeInTheDocument();
      const assignee = screen.getByRole('combobox', { name: '担当者' });
      const user = userEvent.setup();
      await user.click(assignee);
      expect(
        await screen.findByRole('option', { name: '山田太郎' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('option', { name: '名前未設定' }),
      ).toBeInTheDocument();
      await user.click(screen.getByRole('option', { name: '山田太郎' }));
      expect(document.querySelector('[name="assigneeId"]')).toHaveValue(
        'user-1',
      );
      await user.click(assignee);
      await user.click(
        await screen.findByRole('option', { name: '名前未設定' }),
      );
      expect(document.querySelector('[name="assigneeId"]')).toHaveValue(
        'user-2',
      );
      await user.click(assignee);
      await user.click(
        await screen.findByRole('option', { name: '担当者を選択' }),
      );
      expect(document.querySelector('[name="assigneeId"]')).toHaveValue('');
      expect(screen.queryByText('owner@example.test')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'タスクを作成' }),
      ).toHaveAttribute('type', 'submit');
      expect(
        screen.getByRole('button', { name: 'タスクを作成' }),
      ).toBeEnabled();
      expect(screen.getByRole('link', { name: 'キャンセル' })).toHaveAttribute(
        'href',
        '/projects/project-1/tasks',
      );
    },
  );

  it.each([
    { label: 'viewer', currentUserRole: ProjectRole.Viewer, isArchived: false },
    {
      label: 'アーカイブ済み',
      currentUserRole: ProjectRole.Owner,
      isArchived: true,
    },
  ])(
    '$labelでは入力と作成ボタンを無効にし、一覧へ戻るリンクは残す',
    async (state) => {
      mocks.getProject.mockResolvedValue({ ...project, ...state });
      await renderPage();
      expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeDisabled();
      expect(screen.getByRole('combobox', { name: '担当者' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '開始日' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '期限' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'タスクを作成' }),
      ).toBeDisabled();
      expect(screen.getByRole('link', { name: 'キャンセル' })).toHaveAttribute(
        'href',
        '/projects/project-1/tasks',
      );
    },
  );

  it.each([
    { data: { session: null }, error: null },
    { data: { session: null }, error: new Error('session error') },
  ])(
    'セッションを取得できなければ本人情報を取得せず失敗する',
    async (session) => {
      mocks.getSession.mockResolvedValue(session);
      await expect(renderPage()).rejects.toThrow(
        'ログインセッションを取得できませんでした。',
      );
      expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    },
  );

  it('メンバー情報の取得失敗を空の候補や404に置き換えない', async () => {
    const error = new Error('members failed');
    mocks.getProjectMembers.mockRejectedValue(error);
    await expect(renderPage()).rejects.toBe(error);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
