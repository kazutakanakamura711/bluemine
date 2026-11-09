import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpdateTaskRequestError } from '../_lib/update-task';
import { TaskAssigneeEditor } from './task-assignee-editor';

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

const currentAssignee = { id: 'user-1', name: '現在の担当者' };
const nextAssignee = { id: 'user-2', name: '次の担当者' };
const updatedAt = '2026-11-08T00:00:00.000Z';

function renderEditor() {
  return render(
    <TaskAssigneeEditor
      projectId="project-1"
      taskId="task-1"
      assignee={currentAssignee}
      assignees={[currentAssignee, nextAssignee]}
      updatedAt={updatedAt}
    />,
  );
}

describe('TaskAssigneeEditor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('保存中は現在値を保ち、成功後に担当者を更新して通知・再取得する', async () => {
    const user = userEvent.setup();
    let resolveUpdate!: (value: {
      assignee: typeof nextAssignee;
      updatedAt: string;
    }) => void;
    mocks.updateTask.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const { rerender } = renderEditor();

    const editor = screen.getByRole('combobox', { name: '担当者' });
    await user.click(editor);
    await user.click(await screen.findByRole('option', { name: '次の担当者' }));
    expect(mocks.updateTask).toHaveBeenCalledExactlyOnceWith(
      'project-1',
      'task-1',
      { assigneeId: 'user-2' },
    );
    expect(editor).toHaveTextContent('現在の担当者');
    expect(editor).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('保存中');

    await act(async () =>
      resolveUpdate({
        assignee: nextAssignee,
        updatedAt: '2026-11-08T00:01:00.000Z',
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.toast).toHaveBeenCalledWith({
      type: 'success',
      title: '担当者を「次の担当者」に変更しました',
    });
    await waitFor(() => expect(editor).not.toBeDisabled());
    expect(editor).toHaveTextContent('次の担当者');

    rerender(
      <TaskAssigneeEditor
        projectId="project-1"
        taskId="task-1"
        assignee={nextAssignee}
        assignees={[currentAssignee, nextAssignee]}
        updatedAt="2026-11-08T00:01:00.000Z"
      />,
    );
    expect(editor).toHaveTextContent('次の担当者');
  });

  it('未担当を選ぶとnullを送り、未担当のトーストを出す', async () => {
    const user = userEvent.setup();
    mocks.updateTask.mockResolvedValueOnce({
      assignee: null,
      updatedAt: '2026-11-08T00:01:00.000Z',
    });
    renderEditor();

    await user.click(screen.getByRole('combobox', { name: '担当者' }));
    await user.click(await screen.findByRole('option', { name: '未担当' }));
    expect(mocks.updateTask).toHaveBeenCalledExactlyOnceWith(
      'project-1',
      'task-1',
      { assigneeId: null },
    );
    expect(mocks.toast).toHaveBeenCalledWith({
      type: 'success',
      title: '担当者を未担当に変更しました',
    });
    expect(screen.getByRole('combobox', { name: '担当者' })).toHaveTextContent(
      '未担当',
    );
  });

  it('失敗時は現在の担当者を保ってエラーを表示し、再試行できる', async () => {
    const user = userEvent.setup();
    mocks.updateTask.mockRejectedValueOnce(
      new UpdateTaskRequestError('担当者を変更できません', 400),
    );
    renderEditor();

    const editor = screen.getByRole('combobox', { name: '担当者' });
    await user.click(editor);
    await user.click(await screen.findByRole('option', { name: '次の担当者' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '担当者を変更できません',
    );
    expect(editor).toHaveTextContent('現在の担当者');
    expect(editor).toBeEnabled();

    mocks.updateTask.mockResolvedValueOnce({
      assignee: nextAssignee,
      updatedAt: '2026-11-08T00:01:00.000Z',
    });
    await user.click(editor);
    await user.click(await screen.findByRole('option', { name: '次の担当者' }));
    expect(mocks.updateTask).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('現在の担当者を再選択した場合は更新しない', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole('combobox', { name: '担当者' }));
    await user.click(
      await screen.findByRole('option', { name: '現在の担当者' }),
    );
    expect(mocks.updateTask).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('候補から外れた現在の担当者を再選択した場合は更新・再取得しない', async () => {
    const user = userEvent.setup();
    render(
      <TaskAssigneeEditor
        projectId="project-1"
        taskId="task-1"
        assignee={currentAssignee}
        assignees={[nextAssignee]}
        updatedAt={updatedAt}
      />,
    );

    const editor = screen.getByRole('combobox', { name: '担当者' });
    await user.click(editor);
    await user.click(
      await screen.findByRole('option', { name: '現在の担当者' }),
    );
    expect(mocks.updateTask).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(editor).toHaveTextContent('現在の担当者');
  });
});
