import { act, renderHook } from '@testing-library/react';
import { useController } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '@/features/tasks/types/task';
import { updateTask, UpdateTaskRequestError } from './update-task';
import { useEditTaskForm } from './use-edit-task-form';

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));

vi.mock('./update-task', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./update-task')>()),
  updateTask: vi.fn(),
}));

const task: Task = {
  id: 'task-1',
  projectId: 'project-1',
  number: 12,
  title: '保存済みのタイトル',
  description: '保存済みの説明',
  status: 'in_progress',
  priority: 'high',
  assignee: { id: 'user-1', name: '山田太郎' },
  reporter: { id: 'reporter-1', name: '佐藤花子' },
  startDate: '2026-10-15',
  dueDate: '2026-10-20',
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
};

// React Hook Formはモックせず、実際の入力変更・検証を通して送信内容を確認する。
function useTestForm(
  initialTask: Task,
  disabled: boolean,
  onSuccess: () => void,
) {
  const form = useEditTaskForm(initialTask, disabled, onSuccess);
  const { control } = form;
  const title = useController({ name: 'title', control }).field;
  const description = useController({ name: 'description', control }).field;
  const status = useController({ name: 'status', control }).field;
  const priority = useController({ name: 'priority', control }).field;
  const assigneeId = useController({ name: 'assigneeId', control }).field;
  const startDate = useController({ name: 'startDate', control }).field;
  const dueDate = useController({ name: 'dueDate', control }).field;

  return {
    ...form,
    fields: {
      title,
      description,
      status,
      priority,
      assigneeId,
      startDate,
      dueDate,
    },
  };
}

function renderForm(initialTask = task, disabled = false) {
  const onSuccess = vi.fn();
  const hook = renderHook(() => useTestForm(initialTask, disabled, onSuccess));
  return { ...hook, onSuccess };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateTask).mockReset().mockResolvedValue(task);
});

describe('useEditTaskForm', () => {
  it('保存済みTaskの7項目を初期値にし、日付をローカルの年月日として読み込む', () => {
    const { result } = renderForm();
    const { fields } = result.current;

    expect(fields.title.value).toBe(task.title);
    expect(fields.description.value).toBe(task.description);
    expect(fields.status.value).toBe(task.status);
    expect(fields.priority.value).toBe(task.priority);
    expect(fields.assigneeId.value).toBe(task.assignee?.id);
    expect(fields.startDate.value).toEqual(new Date(2026, 9, 15));
    expect(fields.dueDate.value).toEqual(new Date(2026, 9, 20));
    expect(result.current.isBusy).toBe(false);
    expect(result.current.submitError).toBeNull();
  });

  it('未設定の説明・担当者を空文字、日付をnullで初期化する', () => {
    const { result } = renderForm({
      ...task,
      description: null,
      assignee: null,
      startDate: null,
      dueDate: null,
    });

    expect(result.current.fields.description.value).toBe('');
    expect(result.current.fields.assigneeId.value).toBe('');
    expect(result.current.fields.startDate.value).toBeNull();
    expect(result.current.fields.dueDate.value).toBeNull();
  });

  it('タイトルだけを変更すると、正規化したタイトルだけをPATCHし、成功通知後に詳細を再取得する', async () => {
    const { result, onSuccess } = renderForm();
    await act(async () =>
      result.current.fields.title.onChange('  変更したタイトル  '),
    );

    await act(async () =>
      result.current.handleSubmit(result.current.onSubmit)(),
    );

    expect(updateTask).toHaveBeenCalledExactlyOnceWith(
      task.projectId,
      task.id,
      {
        title: '変更したタイトル',
      },
    );
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(onSuccess.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.refresh.mock.invocationCallOrder[0],
    );
    expect(mocks.push).not.toHaveBeenCalled();
    expect(result.current.hasUpdated).toBe(true);
    expect(result.current.isDisabled).toBe(true);
  });

  it.each([false, true])(
    '変更がない場合と変更後に元へ戻した場合は送信しない（元へ戻す=%s）',
    async (revert) => {
      const { result, onSuccess } = renderForm();
      if (revert) {
        await act(async () =>
          result.current.fields.title.onChange('一時的な変更'),
        );
        await act(async () => result.current.fields.title.onChange(task.title));
      }

      await act(async () =>
        result.current.handleSubmit(result.current.onSubmit)(),
      );

      expect(updateTask).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(result.current.isBusy).toBe(false);
      expect(result.current.hasUpdated).toBe(false);
    },
  );

  it.each([
    ['status', 'done'],
    ['priority', 'low'],
  ] as const)(
    '%sだけの変更でも、他の項目を送信しない',
    async (field, value) => {
      const { result } = renderForm();
      await act(async () => result.current.fields[field].onChange(value));

      await act(async () =>
        result.current.handleSubmit(result.current.onSubmit)(),
      );

      expect(updateTask).toHaveBeenCalledExactlyOnceWith(
        task.projectId,
        task.id,
        {
          [field]: value,
        },
      );
    },
  );

  it('説明・担当者・日付を空欄にした場合は、その項目をnullで解除する', async () => {
    const { result } = renderForm();
    await act(async () => {
      result.current.fields.description.onChange('   ');
      result.current.fields.assigneeId.onChange('');
      result.current.fields.startDate.onChange(null);
      result.current.fields.dueDate.onChange(null);
    });

    await act(async () =>
      result.current.handleSubmit(result.current.onSubmit)(),
    );

    expect(updateTask).toHaveBeenCalledExactlyOnceWith(
      task.projectId,
      task.id,
      {
        description: null,
        assigneeId: null,
        startDate: null,
        dueDate: null,
      },
    );
  });

  it('変更した説明・担当者・日付を送信し、Dateは時刻を含まない年月日へ変換する', async () => {
    const { result } = renderForm();
    await act(async () => {
      result.current.fields.description.onChange('  変更した説明  ');
      result.current.fields.assigneeId.onChange('user-2');
      result.current.fields.startDate.onChange(new Date(2026, 10, 1, 23, 45));
      result.current.fields.dueDate.onChange(new Date(2026, 10, 3, 0, 15));
    });

    await act(async () =>
      result.current.handleSubmit(result.current.onSubmit)(),
    );

    expect(updateTask).toHaveBeenCalledExactlyOnceWith(
      task.projectId,
      task.id,
      {
        description: '変更した説明',
        assigneeId: 'user-2',
        startDate: '2026-11-01',
        dueDate: '2026-11-03',
      },
    );
  });

  it('片方の日付だけを変更した場合、もう片方は本文に含めない', async () => {
    const { result } = renderForm();
    await act(async () =>
      result.current.fields.dueDate.onChange(new Date(2026, 9, 25)),
    );

    await act(async () =>
      result.current.handleSubmit(result.current.onSubmit)(),
    );

    expect(updateTask).toHaveBeenCalledExactlyOnceWith(
      task.projectId,
      task.id,
      {
        dueDate: '2026-10-25',
      },
    );
  });

  it('不正な入力は項目エラーにし、APIや成功通知を呼ばない', async () => {
    const { result, onSuccess } = renderForm();
    await act(async () => {
      result.current.fields.title.onChange('  ');
      result.current.fields.dueDate.onChange(new Date(2026, 9, 14));
    });

    await act(async () =>
      result.current.handleSubmit(result.current.onSubmit)(),
    );

    expect(result.current.errors.title?.message).toBe('タイトルは必須です');
    expect(result.current.errors.dueDate?.message).toBe(
      '期限は開始日以降の日付を指定してください',
    );
    expect(updateTask).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('disabledの場合は、有効な入力でも送信しない', async () => {
    const { result, onSuccess } = renderForm(task, true);
    await act(async () =>
      result.current.fields.title.onChange('変更したタイトル'),
    );

    await act(async () =>
      result.current.handleSubmit(result.current.onSubmit)(),
    );

    expect(result.current.isDisabled).toBe(true);
    expect(updateTask).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('重複した検証が先に終わっても保存中の無効状態を保ち、成功後も再送信しない', async () => {
    let resolveRequest!: (value: Task) => void;
    vi.mocked(updateTask).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const { result, onSuccess } = renderForm();
    await act(async () =>
      result.current.fields.title.onChange('変更したタイトル'),
    );
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.handleSubmit(result.current.onSubmit)();
      await result.current.handleSubmit(result.current.onSubmit)();
    });

    expect(updateTask).toHaveBeenCalledOnce();
    expect(result.current.isBusy).toBe(true);
    expect(result.current.isDisabled).toBe(true);
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolveRequest(task);
      await first;
    });
    await act(async () =>
      result.current.handleSubmit(result.current.onSubmit)(),
    );

    expect(updateTask).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each([
    {
      error: new UpdateTaskRequestError(
        'タスクを更新する権限がありません',
        403,
      ),
      message: 'タスクを更新する権限がありません',
    },
    {
      error: new TypeError('Failed to fetch'),
      message:
        'タスクの更新に失敗しました。時間をおいて、もう一度お試しください。',
    },
  ])(
    '失敗時は入力と変更項目を保持し、エラーを表示して再試行できる（$message）',
    async ({ error, message }) => {
      vi.mocked(updateTask).mockRejectedValueOnce(error);
      const { result, onSuccess } = renderForm();
      await act(async () =>
        result.current.fields.title.onChange('変更したタイトル'),
      );

      await act(async () =>
        result.current.handleSubmit(result.current.onSubmit)(),
      );

      expect(result.current.submitError).toBe(message);
      expect(result.current.fields.title.value).toBe('変更したタイトル');
      expect(result.current.isBusy).toBe(false);
      expect(result.current.hasUpdated).toBe(false);
      expect(onSuccess).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();

      await act(async () =>
        result.current.handleSubmit(result.current.onSubmit)(),
      );

      expect(updateTask).toHaveBeenCalledTimes(2);
      expect(updateTask).toHaveBeenLastCalledWith(task.projectId, task.id, {
        title: '変更したタイトル',
      });
      expect(result.current.submitError).toBeNull();
      expect(onSuccess).toHaveBeenCalledOnce();
      expect(mocks.refresh).toHaveBeenCalledOnce();
    },
  );
});
