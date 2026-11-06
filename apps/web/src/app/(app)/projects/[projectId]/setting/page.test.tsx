import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetail } from '../_lib/get-project';
import { ProjectRole } from '@/features/projects/types/project-role';
import ProjectSettingPage from './page';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('../_lib/get-project', () => ({
  getProject: mocks.getProject,
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

// フォーム自体の操作は既存の部品テストで扱う。
vi.mock('./_components/project-settings-panel', () => ({
  ProjectSettingsPanel: ({ project }: { project: { name: string } }) => (
    <section aria-label="プロジェクト設定">{project.name}</section>
  ),
}));

const project: ProjectDetail = {
  id: 'project-id',
  key: 'TEST',
  name: 'テストプロジェクト',
  description: null,
  isArchived: false,
  createdAt: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-10-18T00:00:00.000Z',
  currentUserRole: ProjectRole.Owner,
};

async function renderPage() {
  return render(
    await ProjectSettingPage({
      params: Promise.resolve({ projectId: project.id }),
    }),
  );
}

describe('ProjectSettingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue(project);
  });

  it.each([false, true])(
    'ownerが設定URLを直接開くと設定パネルを表示する（isArchived=%s）',
    async (isArchived) => {
      mocks.getProject.mockResolvedValue({ ...project, isArchived });

      await renderPage();

      expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(
        screen.getByRole('region', { name: 'プロジェクト設定' }),
      ).toHaveTextContent(project.name);
      expect(mocks.getProject).toHaveBeenCalledExactlyOnceWith(project.id);
      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(
        screen.queryByRole('region', { name: 'タスク一覧' }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([ProjectRole.Member, ProjectRole.Viewer])(
    '%sが設定URLを直接開くとタスクURLへ戻す',
    async (currentUserRole) => {
      mocks.getProject.mockResolvedValue({
        ...project,
        id: 'project/id',
        currentUserRole,
      });

      await expect(renderPage()).rejects.toThrow(
        'NEXT_REDIRECT:/projects/project%2Fid/tasks',
      );
      expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(
        '/projects/project%2Fid/tasks',
      );
      expect(
        screen.queryByRole('region', { name: 'プロジェクト設定' }),
      ).not.toBeInTheDocument();
    },
  );

  it('Projectが存在しない、または非参加の場合はnotFoundを呼ぶ', async () => {
    mocks.getProject.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('Project取得失敗は既存のエラー境界へ伝える', async () => {
    const error = new Error('プロジェクト詳細の取得に失敗しました。');
    mocks.getProject.mockRejectedValue(error);

    await expect(renderPage()).rejects.toBe(error);
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
