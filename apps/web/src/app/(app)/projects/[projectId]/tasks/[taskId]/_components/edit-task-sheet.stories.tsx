import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, mocked, waitFor, within } from 'storybook/test';

import type { Task } from '@/features/tasks/types/task';
import { updateTask, UpdateTaskRequestError } from '../_lib/update-task';
import { EditTaskSheet } from './edit-task-sheet';

const task: Task = {
  id: 'task-1',
  projectId: 'project-1',
  number: 10,
  title: 'ログイン機能',
  description:
    'ログインに関連する機能全体の親タスク。JWT認証、ログイン画面、ログインAPIを含む。',
  status: 'in_progress',
  priority: 'high',
  assignee: { id: 'assignee-1', name: '山田 太郎' },
  reporter: { id: 'reporter-1', name: '佐藤 花子' },
  startDate: '2025-08-20',
  dueDate: '2025-09-15',
  createdAt: '2025-08-20T09:00:00.000Z',
  updatedAt: '2026-11-03T09:00:00.000Z',
};

const meta = {
  title: 'Projects/EditTaskSheet',
  component: EditTaskSheet,
  beforeEach: () => {
    mocked(updateTask).mockReset().mockResolvedValue(task);
  },
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-slate-50 p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    task,
    assignees: [
      { id: 'assignee-1', name: '山田 太郎' },
      { id: 'assignee-2', name: '佐藤 花子' },
    ],
  },
} satisfies Meta<typeof EditTaskSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Opened: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '編集' }));
  },
};

export const WithoutOptionalFields: Story = {
  args: {
    task: {
      ...task,
      description: null,
      assignee: null,
      startDate: null,
      dueDate: null,
    },
  },
  play: Opened.play,
};

export const LongContent: Story = {
  args: {
    task: {
      ...task,
      title: '長いタスク名の表示を確認します。'.repeat(10),
      description: '長い説明でも、パネルの幅と高さを保ちます。\n'.repeat(40),
      assignee: {
        id: 'assignee-1',
        name: 'LongAssigneeNameWithoutSpaces'.repeat(6),
      },
    },
    assignees: [],
  },
  play: Opened.play,
};

export const WithoutUserName: Story = {
  args: {
    task: { ...task, assignee: { id: 'assignee-1', name: null } },
    assignees: [{ id: 'assignee-1', name: null }],
  },
  play: Opened.play,
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const ValidationErrors: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '編集' }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.clear(body.getByRole('textbox', { name: 'タイトル' }));
    await userEvent.click(body.getByRole('button', { name: '変更を保存' }));
    await body.findByText('タイトルは必須です');
  },
};

export const Unchanged: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '編集' }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole('button', { name: '変更を保存' }));
    await expect(body.getByRole('form')).toHaveAttribute('aria-busy', 'false');
    await expect(mocked(updateTask)).not.toHaveBeenCalled();
  },
};

export const Saving: Story = {
  beforeEach: () => {
    mocked(updateTask).mockImplementation(() => new Promise(() => {}));
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '編集' }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      body.getByRole('textbox', { name: 'タイトル' }),
      'を更新',
    );
    await userEvent.click(body.getByRole('button', { name: '変更を保存' }));
    await expect(
      body.getByRole('button', { name: 'タスク編集を閉じる' }),
    ).toBeDisabled();
  },
};

export const SaveError: Story = {
  beforeEach: () => {
    // クラスもモック化されるため、既存の作成storyと同じ方法で業務エラーを用意する。
    const error = Object.assign(
      new Error('アーカイブ済みのプロジェクトにはタスクを更新できません'),
      { statusCode: 409 },
    );
    Object.setPrototypeOf(error, UpdateTaskRequestError.prototype);
    mocked(updateTask).mockRejectedValue(error);
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '編集' }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      body.getByRole('textbox', { name: 'タイトル' }),
      'を更新',
    );
    await userEvent.click(body.getByRole('button', { name: '変更を保存' }));
    await body.findByRole('alert');
  },
};

export const SaveSuccess: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '編集' }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      body.getByRole('textbox', { name: 'タイトル' }),
      'を更新',
    );
    await userEvent.click(body.getByRole('button', { name: '変更を保存' }));
    await waitFor(() =>
      expect(body.queryByRole('form')).not.toBeInTheDocument(),
    );
  },
};
