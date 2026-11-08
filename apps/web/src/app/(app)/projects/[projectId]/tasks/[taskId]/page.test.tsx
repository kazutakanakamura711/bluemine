import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectDetail } from '../../_lib/get-project';
import { ProjectRole } from '@/features/projects/types/project-role';
import type { Task } from '@/features/tasks/types/task';
import TaskDetailPage from './page';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getTask: vi.fn(),
  getProjectMembers: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('../../_lib/get-project', () => ({ getProject: mocks.getProject }));
vi.mock('./_lib/get-task', () => ({ getTask: mocks.getTask }));
vi.mock('../../members/_lib/get-project-members', () => ({
  getProjectMembers: mocks.getProjectMembers,
}));
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  useRouter: () => ({ refresh: vi.fn() }),
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

const task: Task = {
  id: 'task-id',
  projectId: project.id,
  number: 12,
  title: 'タスク詳細を表示する',
  description: 'APIから取得した内容を表示します。\n説明の改行も保持します。',
  status: 'in_progress',
  priority: 'high',
  assignee: { id: 'assignee-id', name: '山田太郎' },
  reporter: { id: 'reporter-id', name: '佐藤花子' },
  startDate: '2026-10-29',
  dueDate: '2026-11-02',
  createdAt: '2026-10-28T15:30:00.000Z',
  updatedAt: '2026-10-29T09:00:00.000Z',
};

async function renderPage() {
  return render(
    await TaskDetailPage({
      params: Promise.resolve({ projectId: project.id, taskId: task.id }),
    }),
  );
}

describe('TaskDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue(project);
    mocks.getTask.mockResolvedValue(task);
    mocks.getProjectMembers.mockResolvedValue([
      {
        id: 'membership-1',
        userId: 'user-2',
        role: 'viewer',
        user: { name: '担当者候補', email: 'private@example.test' },
      },
    ]);
  });

  it.each([ProjectRole.Owner, ProjectRole.Member, ProjectRole.Viewer])(
    '%sに取得したTaskを表示し、パンくずからプロジェクトのタスク一覧へ戻れる',
    async (currentUserRole) => {
      mocks.getProject.mockResolvedValue({ ...project, currentUserRole });

      await renderPage();

      expect(mocks.getProject).toHaveBeenCalledExactlyOnceWith(project.id);
      expect(mocks.getTask).toHaveBeenCalledExactlyOnceWith(
        project.id,
        task.id,
      );
      expect(
        screen.getByRole('heading', { name: task.title }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(task.description!, { normalizer: (value) => value }),
      ).toBeInTheDocument();
      expect(screen.getByText('進行中')).toBeInTheDocument();
      expect(screen.getByText('高')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: `${project.key}-${task.number}`,
        }),
      ).toBeInTheDocument();
      expect(
        within(
          screen.getByRole('navigation', { name: 'パンくずリスト' }),
        ).getByText(`${project.key}-${task.number}`),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: project.name })).toHaveAttribute(
        'href',
        `/projects/${project.id}/tasks`,
      );
      expect(
        screen.getByRole('complementary', { name: '属性' }),
      ).toBeInTheDocument();
      const properties = within(
        screen.getByRole('complementary', { name: '属性' }),
      );
      expect(properties.getByText('担当者').parentElement).toHaveTextContent(
        '山田太郎',
      );
      expect(properties.getByText('報告者').parentElement).toHaveTextContent(
        '佐藤花子',
      );
      expect(
        screen.queryByRole('navigation', { name: 'プロジェクト詳細' }),
      ).not.toBeInTheDocument();
      if (currentUserRole === ProjectRole.Viewer) {
        expect(
          screen.queryByRole('button', { name: '編集' }),
        ).not.toBeInTheDocument();
      } else {
        expect(
          screen.getByRole('button', { name: '編集' }),
        ).toBeInTheDocument();
      }
      if (currentUserRole === ProjectRole.Owner) {
        expect(
          screen.getByRole('button', { name: '削除' }),
        ).toBeInTheDocument();
      } else {
        expect(
          screen.queryByRole('button', { name: '削除' }),
        ).not.toBeInTheDocument();
      }
      expect(
        screen.queryByRole('button', { name: '保存' }),
      ).not.toBeInTheDocument();
    },
  );

  it('日付はそのまま、作成・更新日時は日本時間で表示する', async () => {
    await renderPage();

    expect(screen.getByText('2026/10/29')).toHaveAttribute(
      'dateTime',
      task.startDate,
    );
    expect(screen.getByText('2026/11/02')).toHaveAttribute(
      'dateTime',
      task.dueDate,
    );
    expect(screen.getByText('2026/10/29 00:30')).toHaveAttribute(
      'dateTime',
      task.createdAt,
    );
    expect(screen.getByText('2026/10/29 18:00')).toHaveAttribute(
      'dateTime',
      task.updatedAt,
    );
  });

  it('担当者がnullなら未担当と表示し、報告者の名前は表示する', async () => {
    mocks.getTask.mockResolvedValue({ ...task, assignee: null });

    await renderPage();

    const properties = within(
      screen.getByRole('complementary', { name: '属性' }),
    );
    expect(properties.getByText('未担当')).toBeInTheDocument();
    expect(properties.getByText('佐藤花子')).toBeInTheDocument();
    expect(properties.queryByText('名前未設定')).not.toBeInTheDocument();
  });

  it.each([null, '   '])(
    '担当者・報告者の名前が%sなら名前未設定と表示し、未担当とは区別する',
    async (name) => {
      mocks.getTask.mockResolvedValue({
        ...task,
        assignee: { id: 'assignee-id', name },
        reporter: { ...task.reporter, name },
      });

      await renderPage();

      const properties = within(
        screen.getByRole('complementary', { name: '属性' }),
      );
      expect(properties.getAllByText('名前未設定')).toHaveLength(2);
      expect(properties.queryByText('未担当')).not.toBeInTheDocument();
    },
  );

  it('説明・開始日・期限が未設定でも詳細を表示する', async () => {
    mocks.getTask.mockResolvedValue({
      ...task,
      description: null,
      startDate: null,
      dueDate: null,
    });

    await renderPage();

    expect(screen.getByText('説明はありません。')).toBeInTheDocument();
    expect(screen.getAllByText('未設定')).toHaveLength(2);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it('説明にHTMLが含まれていても、実行する要素ではなく本文として表示する', async () => {
    const description =
      '<script>alert("test")</script>\n<a href="https://example.test">リンク</a>';
    mocks.getTask.mockResolvedValue({ ...task, description });

    const { container } = await renderPage();

    expect(
      screen.getByText(description, { normalizer: (value) => value }),
    ).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'リンク' }),
    ).not.toBeInTheDocument();
  });

  it('アーカイブ済みProjectでも詳細を表示する', async () => {
    mocks.getProject.mockResolvedValue({ ...project, isArchived: true });

    await renderPage();

    expect(
      screen.getByRole('heading', { name: task.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'このプロジェクトはアーカイブ済みです。',
    );
  });

  it('Project不在・非参加はTaskを取得せずnotFoundを呼ぶ', async () => {
    mocks.getProject.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.getTask).not.toHaveBeenCalled();
  });

  it('Task APIの404はnotFoundを呼ぶ', async () => {
    mocks.getTask.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it.each(['getProject', 'getTask', 'getProjectMembers'] as const)(
    '%sの取得失敗は404に変換せずエラー境界へ伝える',
    async (method) => {
      const error = new Error('取得に失敗しました。');
      mocks[method].mockRejectedValue(error);

      await expect(renderPage()).rejects.toBe(error);
      expect(mocks.notFound).not.toHaveBeenCalled();
      if (method === 'getProject') expect(mocks.getTask).not.toHaveBeenCalled();
    },
  );
  it.each([
    [ProjectRole.Owner, false, true],
    [ProjectRole.Member, false, true],
    [ProjectRole.Viewer, false, false],
    [ProjectRole.Owner, true, false],
    [ProjectRole.Member, true, false],
    [ProjectRole.Viewer, true, false],
  ])(
    '%s・アーカイブ%sの場合の編集表示と候補取得を確認する',
    async (currentUserRole, isArchived, canEdit) => {
      mocks.getProject.mockResolvedValue({
        ...project,
        isArchived,
        currentUserRole,
      });
      await renderPage();
      const button = screen.queryByRole('button', { name: '編集' });
      if (canEdit) {
        expect(button).toBeInTheDocument();
        expect(mocks.getProjectMembers).toHaveBeenCalledExactlyOnceWith(
          project.id,
        );
      } else {
        expect(button).not.toBeInTheDocument();
        expect(mocks.getProjectMembers).not.toHaveBeenCalled();
      }
      if (currentUserRole === ProjectRole.Owner && !isArchived) {
        expect(
          screen.getByRole('button', { name: '削除' }),
        ).toBeInTheDocument();
      } else {
        expect(
          screen.queryByRole('button', { name: '削除' }),
        ).not.toBeInTheDocument();
      }
    },
  );

  it('候補の名前だけを表示し、参加情報IDではなくUser IDで選択する', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.click(screen.getByRole('button', { name: '編集' }));
    await user.click(screen.getByRole('combobox', { name: '担当者' }));
    await user.click(await screen.findByRole('option', { name: '担当者候補' }));
    expect(document.querySelector('[name="assigneeId"]')).toHaveValue('user-2');
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument();
  });

  it('候補取得時に参加資格を失った場合は404にする', async () => {
    mocks.getProjectMembers.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
