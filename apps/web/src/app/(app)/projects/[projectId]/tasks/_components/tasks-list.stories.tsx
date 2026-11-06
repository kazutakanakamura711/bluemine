import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import type { Task } from '@/features/tasks/types/task';
import { TaskPriority } from '@/features/tasks/types/task-priority';
import { TaskStatus } from '@/features/tasks/types/task-status';
import { Button } from '@/components/ui/button';
import { ProjectRole } from '@/features/projects/types/project-role';
import { ProjectDetailHeader } from '../../_components/project-detail-header';
import {
  ProjectDetailTabs,
  ProjectTabs,
} from '../../_components/project-detail-tabs';
import { TaskList } from './tasks-list';

const tasks: Task[] = [
  {
    id: 'task-1',
    projectId: 'project-1',
    number: 10,
    assignee: { id: 'assignee-1', name: '山田太郎' },
    reporter: { id: 'reporter-1', name: '山田太郎' },
    title: 'ログイン機能を実装する',
    description: null,
    status: TaskStatus.InProgress,
    priority: TaskPriority.High,
    startDate: '2026-10-26',
    dueDate: '2026-10-30',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-27T15:30:00.000Z',
  },
  {
    id: 'task-2',
    projectId: 'project-1',
    number: 12,
    assignee: { id: 'assignee-2', name: '佐藤花子' },
    reporter: { id: 'reporter-1', name: '山田太郎' },
    title: 'タスク一覧画面を作る',
    description: null,
    status: TaskStatus.Todo,
    priority: TaskPriority.Normal,
    startDate: null,
    dueDate: null,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-27T00:00:00.000Z',
  },
  {
    id: 'task-3',
    projectId: 'project-1',
    number: 13,
    assignee: null,
    reporter: { id: 'reporter-1', name: '山田太郎' },
    title: 'Prisma スキーマを定義する',
    description: null,
    status: TaskStatus.Done,
    priority: TaskPriority.Low,
    startDate: '2026-10-24',
    dueDate: '2026-10-26',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
];

const meta = {
  title: 'Projects/TaskList',
  component: TaskList,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-slate-50 lg:ml-56">
        <ProjectDetailHeader
          name="Task Management App"
          projectKey="APP"
          isArchived={false}
          currentUserRole={ProjectRole.Owner}
        />
        <ProjectDetailTabs
          projectId="project-1"
          activeTab={ProjectTabs.Task}
          currentUserRole={ProjectRole.Owner}
        />
        <Story />
      </div>
    ),
  ],
  args: { tasks, projectKey: 'APP' },
} satisfies Meta<typeof TaskList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: { tasks: [] },
};

export const Overdue: Story = {
  args: {
    tasks: [
      { ...tasks[0], dueDate: '2020-09-15' },
      { ...tasks[2], dueDate: '2020-08-31' },
    ],
  },
};

export const LongTitle: Story = {
  args: {
    tasks: [
      {
        ...tasks[0],
        title:
          'タスクのタイトルが長い場合も、ステータスや日付を隠さずに折り返して表示できることを確認する',
      },
      { ...tasks[1], title: 'LongTaskTitleWithoutSpaces'.repeat(8) },
    ],
  },
};

export const WithHeaderAction: Story = {
  parameters: {
    docs: { description: { story: '親から渡す操作の配置例です。' } },
  },
  args: {
    headerAction: (
      <Button className="w-full" disabled>
        操作ボタン
      </Button>
    ),
  },
};

export const WithoutUserNames: Story = {
  args: {
    tasks: [
      {
        ...tasks[0],
        assignee: { id: 'assignee-1', name: null },
        reporter: { id: 'reporter-1', name: null },
      },
      {
        ...tasks[1],
        assignee: null,
        reporter: { id: 'reporter-1', name: null },
      },
    ],
  },
};

export const LongUserNames: Story = {
  args: {
    tasks: [
      {
        ...tasks[0],
        assignee: {
          id: 'assignee-1',
          name: 'LongAssigneeNameWithoutSpaces'.repeat(6),
        },
        reporter: {
          id: 'reporter-1',
          name: 'LongReporterNameWithoutSpaces'.repeat(6),
        },
      },
    ],
  },
};
