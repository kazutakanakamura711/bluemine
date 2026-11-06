import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetail } from '../_lib/get-project';
import { ProjectRole } from '@/features/projects/types/project-role';
import type { Task } from '@/features/tasks/types/task';
import ProjectTasksPage from './page';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getTasks: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('../_lib/get-project', () => ({
  getProject: mocks.getProject,
}));

vi.mock('./_lib/get-tasks', () => ({ getTasks: mocks.getTasks }));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

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

const tasks: Task[] = [
  {
    id: 'task-id',
    projectId: project.id,
    number: 1,
    assignee: null,
    reporter: { id: 'reporter-id', name: '山田太郎' },
    title: 'タスク一覧を接続する',
    description: null,
    status: 'in_progress',
    priority: 'normal',
    startDate: null,
    dueDate: null,
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
  },
];

async function renderPage() {
  return render(
    await ProjectTasksPage({
      params: Promise.resolve({ projectId: project.id }),
    }),
  );
}

describe('ProjectTasksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue(project);
    mocks.getTasks.mockResolvedValue(tasks);
  });

  it.each([
    [ProjectRole.Owner, 'オーナー'],
    [ProjectRole.Member, 'メンバー'],
    [ProjectRole.Viewer, '閲覧者'],
  ] as const)(
    '%sがタスクURLを開くとタスク一覧を表示し、タスクを選択する',
    async (currentUserRole, roleText) => {
      mocks.getProject.mockResolvedValue({ ...project, currentUserRole });

      await renderPage();

      expect(mocks.getProject).toHaveBeenCalledExactlyOnceWith(project.id);
      expect(mocks.getTasks).toHaveBeenCalledExactlyOnceWith(project.id);
      expect(
        screen.getByText(`${project.key} · ${roleText}として参加中`),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'タスク' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(
        within(screen.getByRole('table', { name: 'タスク一覧' })).getByText(
          tasks[0].title,
        ),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('table', { name: 'タスク一覧' })).getByRole(
          'link',
          {
            name: `${project.key}-${tasks[0].number}`,
          },
        ),
      ).toHaveAttribute('href', `/projects/${project.id}/tasks/${tasks[0].id}`);
      expect(Boolean(screen.queryByRole('link', { name: '設定' }))).toBe(
        currentUserRole === ProjectRole.Owner,
      );
      const createTaskLink = screen.queryByRole('link', {
        name: 'タスク作成',
      });
      if (currentUserRole === ProjectRole.Viewer) {
        expect(createTaskLink).not.toBeInTheDocument();
      } else {
        expect(createTaskLink).toHaveAttribute(
          'href',
          `/projects/${project.id}/tasks/new`,
        );
      }
    },
  );

  it.each(Object.values(ProjectRole))(
    'アーカイブ済みProjectでは%sにもタスク作成リンクを表示しない',
    async (currentUserRole) => {
      mocks.getProject.mockResolvedValue({
        ...project,
        currentUserRole,
        isArchived: true,
      });

      await renderPage();

      expect(
        screen.queryByRole('link', { name: 'タスク作成' }),
      ).not.toBeInTheDocument();
    },
  );

  it('Projectが存在しない、または非参加の場合はTaskを取得せずnotFoundを呼ぶ', async () => {
    mocks.getProject.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.getTasks).not.toHaveBeenCalled();
  });

  it('空配列も取得成功として一覧へ渡し、0件の表示にする', async () => {
    mocks.getTasks.mockResolvedValue([]);

    await renderPage();

    expect(screen.getByText('0件')).toBeInTheDocument();
    expect(screen.getByText('タスクはありません。')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'タスク作成' })).toHaveAttribute(
      'href',
      `/projects/${project.id}/tasks/new`,
    );
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('Task取得時の404は空一覧に置き換えず、notFoundを呼ぶ', async () => {
    mocks.getTasks.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it('Taskの取得失敗は404に置き換えず、既存のエラー境界へ伝える', async () => {
    const error = new Error('タスク一覧の取得に失敗しました。');
    mocks.getTasks.mockRejectedValue(error);

    await expect(renderPage()).rejects.toBe(error);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
