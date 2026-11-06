import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '@/features/tasks/types/task';
import { TaskList } from './tasks-list';

const task: Task = {
  id: 'task-1',
  projectId: 'project-1',
  number: 1,
  assignee: { id: 'assignee-1', name: '山田太郎' },
  reporter: { id: 'reporter-1', name: '佐藤花子' },
  title: 'ログイン画面を実装する',
  description: null,
  status: 'in_progress',
  priority: 'high',
  startDate: '2026-10-26',
  dueDate: '2026-10-30',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-27T15:30:00.000Z',
};

describe('TaskList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // UTC は28日、日本時間は29日。期限判定の基準日を固定する。
    vi.setSystemTime(new Date('2026-10-28T15:30:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('0件では空状態を表示し、親から渡したヘッダーの操作を保持する', () => {
    render(
      <TaskList
        tasks={[]}
        projectKey="APP"
        headerAction={<button type="button">ヘッダーの操作</button>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'タスク' })).toBeInTheDocument();
    expect(screen.getByText('0件')).toBeInTheDocument();
    expect(screen.getByText('タスクはありません。')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'ヘッダーの操作' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('Taskがある場合は空状態を表示せず、表とカードに表示名・日付・未設定を表示する', () => {
    const undatedTask: Task = {
      ...task,
      id: 'task-2',
      number: 2,
      assignee: null,
      title: '日付未設定のタスク',
      status: 'done',
      priority: 'low',
      startDate: null,
      dueDate: null,
      updatedAt: '2026-10-26T00:00:00.000Z',
    };

    render(<TaskList tasks={[task, undatedTask]} projectKey="APP" />);

    expect(screen.getByText('2件')).toBeInTheDocument();
    expect(screen.queryByText('タスクはありません。')).not.toBeInTheDocument();

    const table = within(screen.getByRole('table', { name: 'タスク一覧' }));
    expect(
      table.getAllByRole('columnheader').map((header) => header.textContent),
    ).toEqual([
      '番号',
      'タイトル',
      'ステータス',
      '優先度',
      '担当者',
      '報告者',
      '期限',
      '更新日時',
    ]);
    expect(table.getByRole('link', { name: 'APP-1' })).toHaveAttribute(
      'href',
      '/projects/project-1/tasks/task-1',
    );
    const assignedRow = within(
      table.getByRole('row', { name: /ログイン画面を実装する/ }),
    );
    expect(
      assignedRow.getByRole('cell', { name: '山田太郎' }),
    ).toBeInTheDocument();
    expect(
      assignedRow.getByRole('cell', { name: '佐藤花子' }),
    ).toBeInTheDocument();
    expect(table.getByText(task.title)).toBeInTheDocument();
    expect(table.getByRole('link', { name: task.title })).toHaveAttribute(
      'href',
      '/projects/project-1/tasks/task-1',
    );
    expect(table.getByText('進行中')).toBeInTheDocument();
    expect(table.getByText('高')).toBeInTheDocument();
    expect(table.getByText('2026/10/30')).toBeInTheDocument();
    expect(table.getByText('2026/10/28')).toHaveAttribute(
      'dateTime',
      task.updatedAt,
    );
    const undatedRow = within(
      table.getByRole('row', { name: /日付未設定のタスク/ }),
    );
    expect(undatedRow.getByText('完了')).toBeInTheDocument();
    expect(undatedRow.getByText('低')).toBeInTheDocument();
    expect(undatedRow.getAllByText('—')).toHaveLength(1);
    expect(undatedRow.getByText('未担当')).toBeInTheDocument();

    const cards = within(
      screen.getByRole('list', { name: 'タスク一覧（モバイル）' }),
    );
    expect(cards.getAllByRole('listitem')).toHaveLength(2);
    const firstCard = within(cards.getAllByRole('listitem')[0]);
    expect(firstCard.getByRole('link', { name: 'APP-1' })).toHaveAttribute(
      'href',
      '/projects/project-1/tasks/task-1',
    );
    expect(firstCard.getByText('山田太郎')).toBeInTheDocument();
    expect(firstCard.getByText('報告者')).toBeInTheDocument();
    expect(firstCard.getByText('佐藤花子')).toBeInTheDocument();
    expect(
      within(cards.getAllByRole('listitem')[1]).getByText('未担当'),
    ).toBeInTheDocument();
    expect(
      cards.getByRole('heading', { name: task.title }),
    ).toBeInTheDocument();
    expect(cards.getByText('進行中')).toBeInTheDocument();
    expect(cards.getByRole('link', { name: task.title })).toHaveAttribute(
      'href',
      '/projects/project-1/tasks/task-1',
    );
    expect(cards.queryByText('2026/10/28')).not.toBeInTheDocument();
  });

  it.each([
    ['todo', '2026-10-28', true],
    ['in_progress', '2026-10-28', true],
    ['todo', '2026-10-29', false],
    ['todo', '2026-10-30', false],
    ['done', '2026-10-28', false],
    ['todo', null, false],
  ] as const)(
    'status=%s、期限=%s の期限超過表示は%s',
    (status, dueDate, overdue) => {
      render(
        <TaskList tasks={[{ ...task, status, dueDate }]} projectKey="APP" />,
      );

      for (const container of [
        screen.getByRole('table', { name: 'タスク一覧' }),
        screen.getByRole('list', { name: 'タスク一覧（モバイル）' }),
      ]) {
        expect(Boolean(within(container).queryByText('期限超過'))).toBe(
          overdue,
        );
      }
    },
  );

  it.each([null, '   '])(
    '名前が%sなら名前未設定と表示し、未担当と区別する',
    (name) => {
      render(
        <TaskList
          projectKey="APP"
          tasks={[
            {
              ...task,
              assignee: { id: 'assignee-1', name },
              reporter: { id: 'reporter-1', name },
            },
          ]}
        />,
      );

      for (const container of [
        screen.getByRole('table', { name: 'タスク一覧' }),
        screen.getByRole('list', { name: 'タスク一覧（モバイル）' }),
      ]) {
        expect(within(container).getAllByText('名前未設定')).toHaveLength(2);
        expect(within(container).queryByText('未担当')).not.toBeInTheDocument();
      }
    },
  );

  it('番号・タイトルのリンクでProject IDとTask IDをエンコードする', () => {
    render(
      <TaskList
        projectKey="APP"
        tasks={[{ ...task, projectId: 'project/1?x=y', id: 'task/1#detail' }]}
      />,
    );

    for (const container of [
      screen.getByRole('table', { name: 'タスク一覧' }),
      screen.getByRole('list', { name: 'タスク一覧（モバイル）' }),
    ]) {
      for (const name of ['APP-1', task.title]) {
        expect(within(container).getByRole('link', { name })).toHaveAttribute(
          'href',
          '/projects/project%2F1%3Fx%3Dy/tasks/task%2F1%23detail',
        );
      }
    }
  });
});
