import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateTaskForm } from './create-task-form';
import { CreateTaskRequestError } from '../_lib/create-task';
import type { Task } from '@/features/tasks/types/task';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('../_lib/create-task', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/create-task')>()),
  createTask: mocks.createTask,
}));

const createdTask: Task = {
  id: 'task-1',
  projectId: 'project-1',
  number: 1,
  title: 'タイトル',
  description: null,
  status: 'todo',
  priority: 'normal',
  assignee: null,
  reporter: { id: 'user-1', name: '山田太郎' },
  startDate: null,
  dueDate: null,
  createdAt: '2026-10-31T00:00:00.000Z',
  updatedAt: '2026-10-31T00:00:00.000Z',
};

function renderForm(disabled = false) {
  return render(
    <CreateTaskForm
      projectId="project-1"
      reporterName="山田太郎"
      assignees={[
        { id: 'user-1', name: '山田太郎' },
        { id: 'user-2', name: null },
      ]}
      disabled={disabled}
    />,
  );
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
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 10, 12));
  mocks.createTask.mockReset().mockResolvedValue(createdTask);
  mocks.push.mockReset();
  mocks.refresh.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CreateTaskFormの入力管理・検証', () => {
  it('送信前はタイトルのフォーカス・blurでエラーを出さず、送信後は修正に合わせて更新する', async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const title = screen.getByRole('textbox', { name: 'タイトル' });
    await user.click(title);
    await user.click(screen.getByRole('textbox', { name: '説明' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.type(title, '   ');
    await user.tab();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.createTask).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'タスクを作成' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'タイトルは必須です',
    );
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAccessibleDescription('タイトルは必須です');
    await user.type(title, 'タスクを作る');
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
  });

  it('作成ボタンで全体を検証し、修正後は未設定項目をnullにして作成する', async () => {
    const user = userEvent.setup();
    renderForm();
    const title = screen.getByRole('textbox', { name: 'タイトル' });
    await user.click(screen.getByRole('button', { name: 'タスクを作成' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'タイトルは必須です',
    );
    expect(title).toHaveFocus();
    expect(mocks.createTask).not.toHaveBeenCalled();
    await user.type(title, 'タイトル');
    await user.click(screen.getByRole('button', { name: 'タスクを作成' }));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    expect(title).toHaveValue('タイトル');
    expect(mocks.createTask).toHaveBeenCalledExactlyOnceWith('project-1', {
      title: 'タイトル',
      description: null,
      status: 'todo',
      priority: 'normal',
      assigneeId: null,
      startDate: null,
      dueDate: null,
    });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      '/projects/project-1/tasks/task-1',
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
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
    '$nameの上限を超えた入力にエラーを表示する',
    async ({ name, value, message }) => {
      const user = userEvent.setup();
      renderForm();
      if (name === '説明') {
        await user.type(
          screen.getByRole('textbox', { name: 'タイトル' }),
          'タイトル',
        );
      }
      const input = screen.getByRole('textbox', { name });
      await user.click(input);
      await user.paste(value);
      await user.tab();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'タスクを作成' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(input).toHaveAccessibleDescription(message);
    },
  );

  it('検証で再描画されてもステータス・優先度・担当者・日付の選択を保持する', async () => {
    const user = userEvent.setup();
    renderForm();
    for (const [label, option] of [
      ['ステータス', '進行中'],
      ['優先度', '高'],
      ['担当者', '名前未設定'],
    ]) {
      await user.click(screen.getByRole('combobox', { name: label }));
      await user.click(await screen.findByRole('option', { name: option }));
    }
    await selectDate(user, '開始日', 15);
    await user.click(screen.getByRole('button', { name: 'タスクを作成' }));
    await screen.findByText('タイトルは必須です');
    expect(
      screen.getByRole('combobox', { name: 'ステータス' }),
    ).toHaveTextContent('進行中');
    expect(screen.getByRole('combobox', { name: '優先度' })).toHaveTextContent(
      '高',
    );
    expect(document.querySelector('[name="assigneeId"]')).toHaveValue('user-2');
    expect(screen.getByRole('button', { name: '開始日' })).toHaveTextContent(
      '2026/10/15',
    );
    await user.click(screen.getByRole('combobox', { name: '担当者' }));
    await user.click(
      await screen.findByRole('option', { name: '担当者を選択' }),
    );
    expect(document.querySelector('[name="assigneeId"]')).toHaveValue('');
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('日付も初回送信時に検証し、その後は開始日の修正・同日・クリアで期限のエラーを更新する', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(
      screen.getByRole('textbox', { name: 'タイトル' }),
      'タイトル',
    );
    await selectDate(user, '開始日', 15);
    await selectDate(user, '期限', 14);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'タスクを作成' }));
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
    expect(screen.getByRole('button', { name: '期限' })).toHaveTextContent(
      '2026/10/14',
    );
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('Enterでも検証し、ブラウザ標準のフォーム送信を防ぐ', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.click(screen.getByRole('textbox', { name: 'タイトル' }));
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'タイトルは必須です',
    );
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('viewer・アーカイブ済みの無効表示では入力・検証を行わない', async () => {
    const user = userEvent.setup();
    renderForm(true);
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '期限' })).toBeDisabled();
    const button = screen.getByRole('button', { name: 'タスクを作成' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('7項目だけを送信し、日付はUTCに変換せずYYYY-MM-DDで送る', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(
      screen.getByRole('textbox', { name: 'タイトル' }),
      '  タイトル  ',
    );
    await user.type(screen.getByRole('textbox', { name: '説明' }), '  説明  ');
    for (const [label, option] of [
      ['ステータス', '進行中'],
      ['優先度', '高'],
      ['担当者', '名前未設定'],
    ]) {
      await user.click(screen.getByRole('combobox', { name: label }));
      await user.click(await screen.findByRole('option', { name: option }));
    }
    await selectDate(user, '開始日', 15);
    await selectDate(user, '期限', 20);
    await user.type(
      screen.getByRole('spinbutton', { name: '予定工数（時間）' }),
      '4.5',
    );
    await user.click(screen.getByRole('button', { name: 'タスクを作成' }));
    await waitFor(() =>
      expect(mocks.createTask).toHaveBeenCalledExactlyOnceWith('project-1', {
        title: 'タイトル',
        description: '説明',
        status: 'in_progress',
        priority: 'high',
        assigneeId: 'user-2',
        startDate: '2026-10-15',
        dueDate: '2026-10-20',
      }),
    );
  });

  it('連続したsubmitでも1回だけ送信し、送信中と成功後の移動待ちでは入力とキャンセルを無効にする', async () => {
    const user = userEvent.setup();
    let resolveTask!: (value: Task) => void;
    mocks.createTask.mockReturnValue(
      new Promise<Task>((resolve) => {
        resolveTask = resolve;
      }),
    );
    renderForm();
    await user.type(
      screen.getByRole('textbox', { name: 'タイトル' }),
      'タイトル',
    );
    const form = screen.getByRole('form', { name: 'タスク作成フォーム' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    const saving = await screen.findByRole('button', { name: '作成中...' });
    expect(saving).toBeDisabled();
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: '担当者' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '期限' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    expect(mocks.createTask).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
    resolveTask(createdTask);
    expect(
      await screen.findByRole('button', { name: '作成しました' }),
    ).toBeDisabled();
    expect(mocks.push).toHaveBeenCalledWith('/projects/project-1/tasks/task-1');
    fireEvent.submit(form);
    expect(mocks.createTask).toHaveBeenCalledOnce();
  });

  it('無効時と保存中のsubmitもブラウザ標準の送信を止め、保存中の入力無効化を維持する', async () => {
    const user = userEvent.setup();
    const disabledForm = renderForm(true);
    const blockedEvent = new Event('submit', {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(
      screen.getByRole('form', { name: 'タスク作成フォーム' }),
      blockedEvent,
    );
    expect(blockedEvent.defaultPrevented).toBe(true);
    await waitFor(() => expect(mocks.createTask).not.toHaveBeenCalled());
    disabledForm.unmount();

    let resolveTask!: (value: Task) => void;
    mocks.createTask.mockReturnValue(
      new Promise<Task>((resolve) => {
        resolveTask = resolve;
      }),
    );
    renderForm();
    await user.type(
      screen.getByRole('textbox', { name: 'タイトル' }),
      'タイトル',
    );
    const form = screen.getByRole('form', { name: 'タスク作成フォーム' });
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledOnce());
    const duplicateEvent = new Event('submit', {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      fireEvent(form, duplicateEvent);
    });
    expect(duplicateEvent.defaultPrevented).toBe(true);
    // 重複分のhandleSubmitが完了しても、実際のAPI保存が終わるまで入力を有効に戻さない。
    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox', { name: 'タイトル' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '作成中...' })).toBeDisabled();
    expect(form).toHaveAttribute('aria-busy', 'true');
    resolveTask(createdTask);
    await screen.findByRole('button', { name: '作成しました' });
  });

  it.each([
    [400, '担当者は同じプロジェクトの参加者を指定してください'],
    [401, 'ログイン状態を確認できませんでした'],
    [403, 'タスクを作成する権限がありません'],
    [404, 'プロジェクトが見つかりません'],
    [409, 'アーカイブ済みのプロジェクトにはタスクを作成できません'],
    [409, 'タスク番号が競合しました'],
  ])(
    '%sのエラーを入力値を保ったまま表示し、移動しない',
    async (status, message) => {
      const user = userEvent.setup();
      mocks.createTask.mockRejectedValue(
        new CreateTaskRequestError(message, status),
      );
      renderForm();
      await user.type(
        screen.getByRole('textbox', { name: 'タイトル' }),
        '入力を保持する',
      );
      await user.click(screen.getByRole('button', { name: 'タスクを作成' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(screen.getByRole('textbox', { name: 'タイトル' })).toHaveValue(
        '入力を保持する',
      );
      expect(
        screen.getByRole('button', { name: 'タスクを作成' }),
      ).toBeEnabled();
      expect(screen.getByRole('link', { name: 'キャンセル' })).toHaveAttribute(
        'href',
        '/projects/project-1/tasks',
      );
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );

  it('通信失敗を表示し、再試行時に前のエラーを消して作成できる', async () => {
    const user = userEvent.setup();
    mocks.createTask.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderForm();
    await user.type(
      screen.getByRole('textbox', { name: 'タイトル' }),
      'タイトル',
    );
    await user.click(screen.getByRole('button', { name: 'タスクを作成' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'タスクの作成に失敗しました。時間をおいて、もう一度お試しください。',
    );
    await user.click(screen.getByRole('button', { name: 'タスクを作成' }));
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    );
    expect(mocks.createTask).toHaveBeenCalledTimes(2);
    expect(mocks.push).toHaveBeenCalledOnce();
  });
});
