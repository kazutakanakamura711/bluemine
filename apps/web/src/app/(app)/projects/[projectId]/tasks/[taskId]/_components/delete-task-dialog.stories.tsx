import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, mocked, within } from 'storybook/test';

import { deleteTask, DeleteTaskRequestError } from '../_lib/delete-task';
import { DeleteTaskDialog } from './delete-task-dialog';

const meta = {
  title: 'Projects/DeleteTaskDialog',
  component: DeleteTaskDialog,
  beforeEach: () => {
    mocked(deleteTask).mockReset().mockResolvedValue(undefined);
  },
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
  args: {
    projectId: 'project-1',
    taskId: 'task-1',
    taskNumber: 'APP-10',
    taskTitle: 'ログイン機能',
  },
} satisfies Meta<typeof DeleteTaskDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '削除' }));
  },
};

export const LongTitle: Story = {
  args: { taskTitle: '長いタスク名の表示を確認します。'.repeat(10) },
  play: Default.play,
};

export const Deleting: Story = {
  beforeEach: () => {
    mocked(deleteTask).mockImplementation(() => new Promise(() => {}));
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '削除' }));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole('alertdialog', { name: 'タスクを削除' });
    await userEvent.click(within(dialog).getByRole('button', { name: '削除' }));
    await expect(
      body.getByRole('button', { name: '削除中...' }),
    ).toBeDisabled();
  },
};

export const DeleteError: Story = {
  beforeEach: () => {
    const error = Object.assign(
      new Error('アーカイブ済みのプロジェクトはタスクを削除できません'),
      { statusCode: 409 },
    );
    Object.setPrototypeOf(error, DeleteTaskRequestError.prototype);
    mocked(deleteTask).mockRejectedValue(error);
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: '削除' }));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole('alertdialog', { name: 'タスクを削除' });
    await userEvent.click(within(dialog).getByRole('button', { name: '削除' }));
    await body.findByRole('alert');
  },
};
