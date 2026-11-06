import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { Task } from '@/features/tasks/types/task';
import TaskDetailError from '../error';
import TaskDetailLoading from '../loading';
import { EditTaskSheet } from './edit-task-sheet';
import { TaskDetail } from './task-detail';

const task: Task = {
  id: 'task-1',
  projectId: 'project-1',
  number: 12,
  title: 'ログイン画面を実装する',
  description:
    'メールアドレスとパスワードでログインできる画面を作ります。\n入力エラーと送信中の表示を確認します。',
  status: 'in_progress',
  priority: 'high',
  assignee: { id: 'assignee-1', name: '山田太郎' },
  reporter: { id: 'reporter-1', name: '佐藤花子' },
  startDate: '2026-10-29',
  dueDate: '2026-11-02',
  createdAt: '2026-10-28T15:30:00.000Z',
  updatedAt: '2026-10-29T09:00:00.000Z',
};

const meta = {
  title: 'Projects/TaskDetail',
  component: TaskDetail,
  parameters: { layout: 'fullscreen', nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-slate-50 lg:ml-56">
        <Story />
      </div>
    ),
  ],
  args: {
    task,
    projectKey: 'APP',
    projectName: 'Task Management App',
    isArchived: false,
  },
} satisfies Meta<typeof TaskDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithEditAction: Story = {
  render: (args) => (
    <TaskDetail {...args} headerAction={<EditTaskSheet task={args.task} />} />
  ),
};

export const Loading: Story = {
  render: () => <TaskDetailLoading />,
};

export const Error: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: {
        segments: [
          ['projectId', 'project-1'],
          ['taskId', 'task-1'],
        ],
      },
    },
  },
  render: () => <TaskDetailError retry={() => undefined} />,
};

export const Archived: Story = {
  args: { isArchived: true },
};

export const WithoutOptionalFields: Story = {
  args: {
    task: {
      ...task,
      description: null,
      assignee: null,
      startDate: null,
      dueDate: null,
      status: 'todo',
      priority: 'normal',
    },
  },
};

export const LongContent: Story = {
  args: {
    projectName: 'LongProjectNameWithoutSpaces'.repeat(6),
    task: {
      ...task,
      assignee: {
        id: 'assignee-1',
        name: 'LongAssigneeNameWithoutSpaces'.repeat(6),
      },
      reporter: {
        id: 'reporter-1',
        name: 'LongReporterNameWithoutSpaces'.repeat(6),
      },
      title: 'LongTaskTitleWithoutSpaces'.repeat(8),
      description:
        '長い説明でも改行を保持して読み進められることを確認します。\n'.repeat(
          40,
        ) + 'LongDescriptionWithoutSpaces'.repeat(30),
      status: 'done',
      priority: 'low',
    },
  },
};

export const WithoutUserNames: Story = {
  args: {
    task: {
      ...task,
      assignee: { id: 'assignee-1', name: null },
      reporter: { id: 'reporter-1', name: null },
    },
  },
};

export const LongContentWithEditAction: Story = {
  args: LongContent.args,
  render: WithEditAction.render,
};
