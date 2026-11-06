import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '@/features/tasks/types/task';
import { updateTask } from '../_lib/update-task';
import { EditTaskSheet } from './edit-task-sheet';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('../_lib/update-task', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/update-task')>()),
  updateTask: vi.fn(),
}));

const task: Task = {
  id: 'task-1',
  projectId: 'project-1',
  number: 12,
  title: '保存済みのタイトル',
  description: null,
  status: 'todo',
  priority: 'normal',
  assignee: null,
  reporter: { id: 'reporter-1', name: null },
  startDate: '2026-10-15',
  dueDate: null,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateTask).mockReset().mockResolvedValue(task);
});

async function requestClose(
  user: ReturnType<typeof userEvent.setup>,
  close: string,
) {
  if (close === 'Escape') {
    await user.keyboard('{Escape}');
  } else if (close === '背景') {
    const overlay = document.querySelector<HTMLElement>(
      '[data-slot="sheet-overlay"]',
    );
    expect(overlay).not.toBeNull();
    await user.click(overlay!);
  } else {
    await user.click(screen.getByRole('button', { name: close }));
  }
}

describe('EditTaskSheetの入力リセット', () => {
  it.each(['キャンセル', 'タスク編集を閉じる', 'Escape', '背景'])(
    '%sで閉じて開き直すと、変更・エラー・日付を保存済みの値に戻す',
    async (close) => {
      const user = userEvent.setup();
      render(<EditTaskSheet task={task} />);
      const trigger = screen.getByRole('button', { name: '編集' });
      await user.click(trigger);
      await user.clear(screen.getByRole('textbox', { name: 'タイトル' }));
      await user.type(
        screen.getByRole('textbox', { name: '説明' }),
        '保存しない説明',
      );
      await user.click(screen.getByRole('button', { name: '開始日' }));
      const calendar = await screen.findByRole('dialog', {
        name: '開始日を選択',
      });
      await user.click(
        within(calendar).getByRole('button', { name: '開始日をクリア' }),
      );
      await waitFor(() => expect(calendar).not.toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: '変更を保存' }));
      await screen.findByRole('alert');
      await requestClose(user, close);
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      await user.click(trigger);
      expect(screen.getByRole('textbox', { name: 'タイトル' })).toHaveValue(
        task.title,
      );
      expect(screen.getByRole('textbox', { name: '説明' })).toHaveValue('');
      expect(screen.getByRole('button', { name: '開始日' })).toHaveTextContent(
        '2026/10/15',
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('保存失敗後も入力を保持し、閉じた後は最新Taskのpropsから初期化する', async () => {
    const user = userEvent.setup();
    vi.mocked(updateTask).mockRejectedValueOnce(
      new TypeError('Failed to fetch'),
    );
    const view = render(<EditTaskSheet task={task} />);
    const trigger = screen.getByRole('button', { name: '編集' });
    await user.click(trigger);
    await user.type(
      screen.getByRole('textbox', { name: 'タイトル' }),
      'を編集',
    );
    await user.click(screen.getByRole('button', { name: '変更を保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'タスクの更新に失敗しました。',
    );
    expect(screen.getByRole('dialog', { name: 'タスクを編集' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    view.rerender(
      <EditTaskSheet
        task={{ ...task, title: '再取得したタイトル', startDate: null }}
      />,
    );
    await user.click(trigger);
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toHaveValue(
      '再取得したタイトル',
    );
    expect(screen.getByRole('button', { name: '開始日' })).toHaveTextContent(
      '年 /月 /日',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['成功', '失敗'])(
    '保存中はキャンセル・×・Escape・背景で閉じられず、%s後は状態に応じて閉じられる',
    async (outcome) => {
      const user = userEvent.setup();
      const request = Promise.withResolvers<Task>();
      vi.mocked(updateTask).mockReturnValue(request.promise);
      const view = render(<EditTaskSheet task={task} />);
      const trigger = screen.getByRole('button', { name: '編集' });
      await user.click(trigger);
      const title = screen.getByRole('textbox', { name: 'タイトル' });
      await user.clear(title);
      await user.type(title, '変更したタイトル');
      await user.click(screen.getByRole('button', { name: '変更を保存' }));
      await waitFor(() => expect(updateTask).toHaveBeenCalledOnce());

      expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'タスク編集を閉じる' }),
      ).toBeDisabled();
      expect(screen.getByRole('button', { name: '変更を保存' })).toBeDisabled();
      expect(title).toBeDisabled();
      fireEvent.submit(screen.getByRole('form'));
      for (const close of [
        'キャンセル',
        'タスク編集を閉じる',
        'Escape',
        '背景',
      ]) {
        await requestClose(user, close);
        expect(
          screen.getByRole('dialog', { name: 'タスクを編集' }),
        ).toBeVisible();
        expect(title).toHaveValue('変更したタイトル');
      }
      expect(updateTask).toHaveBeenCalledExactlyOnceWith(
        task.projectId,
        task.id,
        {
          title: '変更したタイトル',
        },
      );

      if (outcome === '成功') {
        await act(async () =>
          request.resolve({ ...task, title: '変更したタイトル' }),
        );
        await waitFor(() =>
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
        expect(mocks.refresh).toHaveBeenCalledOnce();
        view.rerender(
          <EditTaskSheet task={{ ...task, title: '変更したタイトル' }} />,
        );
        await user.click(trigger);
        expect(screen.getByRole('textbox', { name: 'タイトル' })).toHaveValue(
          '変更したタイトル',
        );
        expect(
          screen.getByRole('button', { name: 'タスク編集を閉じる' }),
        ).toBeEnabled();
      } else {
        await act(async () => request.reject(new TypeError('Failed to fetch')));
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'タスクの更新に失敗しました。',
        );
        expect(title).toHaveValue('変更したタイトル');
        expect(title).toBeEnabled();
        expect(
          screen.getByRole('button', { name: 'タスク編集を閉じる' }),
        ).toBeEnabled();
        expect(mocks.refresh).not.toHaveBeenCalled();
        await requestClose(user, 'Escape');
        await waitFor(() =>
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
        );
      }
    },
  );
});
