import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaskStatusEditor } from './task-status-editor';
import { UpdateTaskRequestError } from '../_lib/update-task';

const mocks = vi.hoisted(() => ({
  updateTask: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }));
vi.mock('../_lib/update-task', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/update-task')>()),
  updateTask: mocks.updateTask,
}));

describe('TaskStatusEditor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('保存中は元の値を表示して操作を止め、成功後に通知して再取得する', async () => {
    const user = userEvent.setup();
    let resolveUpdate!: (value: { status: 'done'; updatedAt: string }) => void;
    mocks.updateTask.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const { rerender } = render(
      <TaskStatusEditor
        projectId="project-1"
        taskId="task-1"
        status="in_progress"
        updatedAt="2026-11-08T00:00:00.000Z"
      />,
    );

    const editor = screen.getByRole('combobox', { name: 'ステータス' });
    await user.click(editor);
    await user.click(await screen.findByRole('option', { name: '完了' }));
    expect(mocks.updateTask).toHaveBeenCalledExactlyOnceWith(
      'project-1',
      'task-1',
      { status: 'done' },
    );
    expect(editor).toHaveTextContent('進行中');
    expect(editor).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('保存中');

    await act(async () =>
      resolveUpdate({ status: 'done', updatedAt: '2026-11-08T00:01:00.000Z' }),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledWith({
      type: 'success',
      title: 'ステータスを「完了」に変更しました',
    });
    await waitFor(() => expect(editor).not.toBeDisabled());
    expect(editor).toHaveTextContent('完了');
    rerender(
      <TaskStatusEditor
        projectId="project-1"
        taskId="task-1"
        status="done"
        updatedAt="2026-11-08T00:01:00.000Z"
      />,
    );
    expect(editor).toHaveTextContent('完了');
    rerender(
      <TaskStatusEditor
        projectId="project-1"
        taskId="task-1"
        status="todo"
        updatedAt="2026-11-08T00:02:00.000Z"
      />,
    );
    expect(editor).toHaveTextContent('未着手');
  });

  it('失敗時は元の値とエラーを表示し、再試行できる', async () => {
    const user = userEvent.setup();
    mocks.updateTask.mockRejectedValueOnce(
      new UpdateTaskRequestError('更新できません', 403),
    );
    render(
      <TaskStatusEditor
        projectId="project-1"
        taskId="task-1"
        status="in_progress"
        updatedAt="2026-11-08T00:00:00.000Z"
      />,
    );

    const editor = screen.getByRole('combobox', { name: 'ステータス' });
    await user.click(editor);
    await user.click(await screen.findByRole('option', { name: '完了' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '更新できません',
    );
    expect(editor).toHaveTextContent('進行中');
    expect(editor).not.toBeDisabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    await user.click(editor);
    mocks.updateTask.mockResolvedValueOnce({
      status: 'done',
      updatedAt: '2026-11-08T00:01:00.000Z',
    });
    await user.click(await screen.findByRole('option', { name: '完了' }));
    expect(mocks.updateTask).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('同じ値を選択した場合は更新しない', async () => {
    const user = userEvent.setup();
    render(
      <TaskStatusEditor
        projectId="project-1"
        taskId="task-1"
        status="in_progress"
        updatedAt="2026-11-08T00:00:00.000Z"
      />,
    );
    await user.click(screen.getByRole('combobox', { name: 'ステータス' }));
    await user.click(await screen.findByRole('option', { name: '進行中' }));
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });
});
