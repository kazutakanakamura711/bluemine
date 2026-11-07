import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteTask, DeleteTaskRequestError } from './delete-task';
import { useDeleteTaskDialog } from './use-delete-task-dialog';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock('@/components/ui/toast', () => ({ toast: { add: mocks.toast } }));
vi.mock('./delete-task', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./delete-task')>()),
  deleteTask: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteTask).mockReset().mockResolvedValue(undefined);
});

describe('useDeleteTaskDialog', () => {
  it('閉じている間は送信せず、送信中と成功後の移動中は重複送信を防ぐ', async () => {
    const request = Promise.withResolvers<void>();
    vi.mocked(deleteTask).mockReturnValue(request.promise);
    const { result } = renderHook(() =>
      useDeleteTaskDialog({ projectId: 'project/1', taskId: 'task-1' }),
    );

    await act(async () => result.current.handleDelete());
    expect(deleteTask).not.toHaveBeenCalled();
    act(() => {
      expect(result.current.handleOpenChange(true)).toBe(true);
    });

    // 古いハンドラーを同じ描画中に複数回呼んでもリクエストは1回だけ。
    const handleDelete = result.current.handleDelete;
    act(() => {
      void handleDelete();
      void handleDelete();
      expect(result.current.handleOpenChange(false)).toBe(false);
    });
    expect(deleteTask).toHaveBeenCalledExactlyOnceWith('project/1', 'task-1');
    expect(result.current.isOpen).toBe(true);
    expect(result.current.isDeleting).toBe(true);

    await act(async () => request.resolve());
    expect(result.current.isOpen).toBe(false);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      '/projects/project%2F1/tasks',
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    await act(async () => handleDelete());
    expect(deleteTask).toHaveBeenCalledOnce();
  });

  it('削除失敗後はロックを解除し、閉じて再度開くとエラーを消す', async () => {
    vi.mocked(deleteTask).mockRejectedValueOnce(
      new DeleteTaskRequestError('タスクが見つかりません', 404),
    );
    const { result } = renderHook(() =>
      useDeleteTaskDialog({ projectId: 'project-1', taskId: 'task-1' }),
    );

    act(() => {
      result.current.handleOpenChange(true);
    });
    await act(async () => result.current.handleDelete());
    expect(result.current.isDeleting).toBe(false);
    expect(result.current.deleteError).toBe('タスクが見つかりません');
    expect(mocks.replace).not.toHaveBeenCalled();

    act(() => {
      expect(result.current.handleOpenChange(false)).toBe(true);
    });
    expect(result.current.deleteError).toBeNull();
    act(() => {
      result.current.handleOpenChange(true);
    });
    await act(async () => result.current.handleDelete());
    expect(deleteTask).toHaveBeenCalledTimes(2);
    expect(mocks.replace).toHaveBeenCalledOnce();
  });
});
