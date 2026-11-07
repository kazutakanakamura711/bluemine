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

import { deleteTask, DeleteTaskRequestError } from '../_lib/delete-task';
import { DeleteTaskDialog } from './delete-task-dialog';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }));
vi.mock('../_lib/delete-task', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/delete-task')>()),
  deleteTask: vi.fn(),
}));

const props = {
  projectId: 'project-1',
  taskId: 'task-1',
  taskNumber: 'APP-10',
  taskTitle: 'ログイン機能',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteTask).mockReset().mockResolvedValue(undefined);
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '削除' }));
  return screen.getByRole('alertdialog', { name: 'タスクを削除' });
}

describe('DeleteTaskDialog', () => {
  it.each(['キャンセル', '閉じる', 'Escape'])(
    '%sで閉じ、削除せず入口にフォーカスを戻す',
    async (close) => {
      const user = userEvent.setup();
      render(<DeleteTaskDialog {...props} />);
      const trigger = screen.getByRole('button', { name: '削除' });
      const dialog = await openDialog(user);
      expect(dialog).toHaveTextContent('APP-10「ログイン機能」');
      expect(dialog).toHaveTextContent('この操作は元に戻せません。');
      await waitFor(() =>
        expect(
          within(dialog).getByRole('button', { name: 'キャンセル' }),
        ).toHaveFocus(),
      );

      if (close === 'Escape') await user.keyboard('{Escape}');
      else
        await user.click(within(dialog).getByRole('button', { name: close }));

      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(deleteTask).not.toHaveBeenCalled();
    },
  );

  it('送信中は閉鎖と二重送信を防ぎ、成功すると一覧へ移動する', async () => {
    const user = userEvent.setup();
    const request = Promise.withResolvers<void>();
    vi.mocked(deleteTask).mockReturnValue(request.promise);
    render(<DeleteTaskDialog {...props} />);
    const dialog = await openDialog(user);
    const confirm = within(dialog).getByRole('button', { name: '削除' });

    // Reactの再描画前にも連続して呼ばれた場合を確認する。
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(deleteTask).toHaveBeenCalledExactlyOnceWith('project-1', 'task-1');
    expect(
      within(dialog).getByRole('button', { name: '削除中...' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'キャンセル' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: '閉じる' }),
    ).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(dialog).toBeVisible();

    await act(async () => request.resolve());
    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      type: 'success',
      title: 'タスクを削除しました',
    });
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      '/projects/project-1/tasks',
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteTask).toHaveBeenCalledOnce();
  });

  it.each([
    [
      '対象不在',
      new DeleteTaskRequestError('タスクが見つかりません', 404),
      'タスクが見つかりません',
    ],
    [
      'アーカイブ済み',
      new DeleteTaskRequestError(
        'アーカイブ済みのプロジェクトはタスクを削除できません',
        409,
      ),
      'アーカイブ済みのプロジェクトはタスクを削除できません',
    ],
    [
      '通信失敗',
      new TypeError('Failed to fetch'),
      '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
    ],
  ])(
    '%sの場合はDialogにエラーを表示し、再試行できる',
    async (_label, error, message) => {
      const user = userEvent.setup();
      vi.mocked(deleteTask).mockRejectedValueOnce(error);
      render(<DeleteTaskDialog {...props} />);
      const dialog = await openDialog(user);

      await user.click(within(dialog).getByRole('button', { name: '削除' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        message,
      );
      expect(dialog).toBeVisible();
      expect(mocks.replace).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: '削除' }));
      await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce());
      expect(deleteTask).toHaveBeenCalledTimes(2);
    },
  );

  it('エラーを閉じた後は、開き直しても前回のエラーを表示しない', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteTask).mockRejectedValueOnce(new Error('network'));
    render(<DeleteTaskDialog {...props} />);
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole('button', { name: '削除' }));
    await within(dialog).findByRole('alert');
    await user.click(
      within(dialog).getByRole('button', { name: 'キャンセル' }),
    );
    await waitFor(() => expect(dialog).not.toBeInTheDocument());

    const reopened = await openDialog(user);
    expect(within(reopened).queryByRole('alert')).not.toBeInTheDocument();
  });
});
