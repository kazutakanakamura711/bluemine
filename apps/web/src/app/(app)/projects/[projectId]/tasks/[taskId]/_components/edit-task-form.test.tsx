import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Task } from '@/features/tasks/types/task';
import { updateTask, UpdateTaskRequestError } from '../_lib/update-task';
import { EditTaskForm } from './edit-task-form';

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

function renderForm(overrides: Partial<Task> = {}, disabled = false) {
  const onSuccess = vi.fn();
  const view = render(
    <EditTaskForm
      task={{ ...task, ...overrides }}
      assignees={[
        { id: 'user-1', name: '山田太郎' },
        { id: 'user-2', name: null },
      ]}
      onCancel={vi.fn()}
      onSuccess={onSuccess}
      onBusyChange={vi.fn()}
      disabled={disabled}
    />,
  );
  return { ...view, onSuccess };
}

async function selectDate(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  day: number,
) {
  await user.click(screen.getByRole('button', { name: label }));
  const popup = await screen.findByRole('dialog', { name: `${label}を選択` });
  await user.click(
    within(popup).getByRole('button', {
      name: new RegExp(`2026年10月${day}日`),
    }),
  );
  await waitFor(() => expect(popup).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateTask).mockReset().mockResolvedValue(task);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 10, 12));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('EditTaskForm', () => {
  it('保存済みTaskの7項目を初期表示し、未設定項目を入力用の値にする', () => {
    const view = renderForm();
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toHaveValue(
      task.title,
    );
    expect(screen.getByRole('textbox', { name: '説明' })).toHaveValue(
      task.description,
    );
    expect(
      screen.getByRole('combobox', { name: 'ステータス' }),
    ).toHaveTextContent('進行中');
    expect(screen.getByRole('combobox', { name: '優先度' })).toHaveTextContent(
      '高',
    );
    expect(screen.getByRole('combobox', { name: '担当者' })).toHaveTextContent(
      '山田太郎',
    );
    expect(screen.getByRole('button', { name: '開始日' })).toHaveTextContent(
      '2026/10/15',
    );
    expect(screen.getByRole('button', { name: '期限' })).toHaveTextContent(
      '2026/10/20',
    );
    view.unmount();

    renderForm({
      description: null,
      assignee: null,
      startDate: null,
      dueDate: null,
    });
    expect(screen.getByRole('textbox', { name: '説明' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: '担当者' })).toHaveTextContent(
      '未担当',
    );
    expect(document.querySelector('[name="assigneeId"]')).toHaveValue('');
    expect(document.querySelector('[name="startDate"]')).toHaveValue('');
    expect(document.querySelector('[name="dueDate"]')).toHaveValue('');
  });

  it.each(['0001-01-01', '9999-12-31'])(
    '年の端点%sも年月日を変えず初期表示する',
    (date) => {
      renderForm({ startDate: date, dueDate: date });
      expect(screen.getByRole('button', { name: '開始日' })).toHaveTextContent(
        date.replaceAll('-', '/'),
      );
      expect(document.querySelector('[name="dueDate"]')).toHaveValue(date);
    },
  );

  it('送信前はblurでエラーを出さず、送信後は入力修正に合わせて検証する', async () => {
    const user = userEvent.setup();
    renderForm();
    const title = screen.getByRole('textbox', { name: 'タイトル' });
    await user.clear(title);
    await user.tab();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '変更を保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'タイトルは必須です',
    );
    expect(title).toHaveAccessibleDescription('タイトルは必須です');
    expect(title).toHaveFocus();
    await user.type(title, '修正したタイトル');
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });

  it.each([
    {
      name: 'タイトル',
      value: 'あ'.repeat(201),
      message: 'タイトルは200文字以内で入力してください',
    },
    {
      name: '説明',
      value: 'あ'.repeat(5001),
      message: '説明は5,000文字以内で入力してください',
    },
  ])(
    '$nameの文字数上限と項目に関連付けたエラーを確認する',
    async ({ name, value, message }) => {
      const user = userEvent.setup();
      renderForm();
      const input = screen.getByRole('textbox', { name });
      await user.clear(input);
      await user.paste(value);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '変更を保存' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(input).toHaveAccessibleDescription(message);
      await user.clear(input);
      await user.type(input, '修正しました');
      await waitFor(() =>
        expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
      );
    },
  );

  it('Selectの変更・担当解除を保持し、検証エラーでも選択を失わない', async () => {
    const user = userEvent.setup();
    renderForm();
    for (const [label, option] of [
      ['ステータス', '完了'],
      ['優先度', '低'],
      ['担当者', '名前未設定'],
    ]) {
      await user.click(screen.getByRole('combobox', { name: label }));
      await user.click(await screen.findByRole('option', { name: option }));
    }
    await user.clear(screen.getByRole('textbox', { name: 'タイトル' }));
    await user.click(screen.getByRole('button', { name: '変更を保存' }));
    await screen.findByRole('alert');
    expect(
      screen.getByRole('combobox', { name: 'ステータス' }),
    ).toHaveTextContent('完了');
    expect(screen.getByRole('combobox', { name: '優先度' })).toHaveTextContent(
      '低',
    );
    expect(document.querySelector('[name="assigneeId"]')).toHaveValue('user-2');
    await user.click(screen.getByRole('combobox', { name: '担当者' }));
    await user.click(await screen.findByRole('option', { name: '未担当' }));
    expect(document.querySelector('[name="assigneeId"]')).toHaveValue('');
  });

  it('片方の日付だけの変更も初期値と合わせて検証し、同日・クリアで再検証する', async () => {
    const user = userEvent.setup();
    renderForm();
    await selectDate(user, '期限', 14);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '変更を保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '期限は開始日以降の日付を指定してください',
    );
    expect(
      screen.getByRole('button', { name: '期限' }),
    ).toHaveAccessibleDescription('期限は開始日以降の日付を指定してください');
    await selectDate(user, '開始日', 14);
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    await selectDate(user, '開始日', 16);
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: '開始日' }));
    const popup = await screen.findByRole('dialog', { name: '開始日を選択' });
    await user.click(
      within(popup).getByRole('button', { name: '開始日をクリア' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    expect(document.querySelector('[name="startDate"]')).toHaveValue('');
    expect(document.querySelector('[name="dueDate"]')).toHaveValue(
      '2026-10-14',
    );
  });

  it('Enterでも検証し、変更した項目を保存して成功を通知する', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { onSuccess } = renderForm();
    const title = screen.getByRole('textbox', { name: 'タイトル' });
    await user.clear(title);
    await user.keyboard('{Enter}');
    await screen.findByRole('alert');
    await user.type(title, '変更したタイトル');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(updateTask).toHaveBeenCalledExactlyOnceWith(
      task.projectId,
      task.id,
      {
        title: '変更したタイトル',
      },
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(title).toHaveValue('変更したタイトル');
    expect(task.title).toBe('保存済みのタイトル');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(title).toBeDisabled();
  });

  it('無効時は入力・保存できず、キャンセルは使える', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    render(
      <EditTaskForm
        task={task}
        disabled
        onCancel={cancel}
        onSuccess={vi.fn()}
        onBusyChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '担当者' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '期限' })).toBeDisabled();
    const save = screen.getByRole('button', { name: '変更を保存' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('無効時のsubmitもブラウザ標準の送信を止め、検証成功にはしない', async () => {
    renderForm({}, true);
    const event = new Event('submit', { bubbles: true, cancelable: true });
    const form = screen.getByRole('form', { name: 'タスク編集フォーム' });
    fireEvent(form, event);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(form).toHaveAttribute('aria-busy', 'false'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('変更がなければ保存も成功通知も行わない', async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderForm();
    await user.click(screen.getByRole('button', { name: '変更を保存' }));
    await waitFor(() =>
      expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'false'),
    );
    expect(updateTask).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('保存失敗の理由を表示し、入力を保持して再試行できる', async () => {
    const user = userEvent.setup();
    vi.mocked(updateTask).mockRejectedValueOnce(
      new UpdateTaskRequestError('タスクを更新する権限がありません', 403),
    );
    const { onSuccess } = renderForm();
    const title = screen.getByRole('textbox', { name: 'タイトル' });
    await user.clear(title);
    await user.type(title, '変更したタイトル');
    await user.click(screen.getByRole('button', { name: '変更を保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'タスクを更新する権限がありません',
    );
    expect(title).toHaveValue('変更したタイトル');
    expect(title).toBeEnabled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '変更を保存' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(updateTask).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
