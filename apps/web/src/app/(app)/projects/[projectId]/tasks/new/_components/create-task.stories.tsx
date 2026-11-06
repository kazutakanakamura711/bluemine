import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { mocked } from 'storybook/test';

import type { Project } from '@/app/(app)/projects/_lib/get-projects';
import { AppHeader } from '@/app/(app)/_components/app-header';
import { ProjectsSidebar } from '@/app/(app)/_components/projects-sidebar';
import { CreateTask } from './create-task';
import { createTask, CreateTaskRequestError } from '../_lib/create-task';
import type { Task } from '@/features/tasks/types/task';

const createdTask: Task = {
  id: 'task-1',
  projectId: 'project-1',
  number: 1,
  title: 'ログイン画面を作る',
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

const projects: Project[] = [
  {
    id: 'project-1',
    key: 'APP',
    name: 'Task Management App',
    description: null,
    isArchived: false,
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
  },
  {
    id: 'project-2',
    key: 'CORP',
    name: 'コーポレートサイト刷新',
    description: null,
    isArchived: false,
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
  },
  {
    id: 'project-3',
    key: 'MOB',
    name: 'モバイルアプリ開発',
    description: null,
    isArchived: true,
    createdAt: '2026-10-30T00:00:00.000Z',
    updatedAt: '2026-10-30T00:00:00.000Z',
  },
];

const meta = {
  title: 'Projects/CreateTask',
  component: CreateTask,
  beforeEach: () => {
    mocked(createTask).mockReset().mockResolvedValue(createdTask);
  },
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/projects/project-1/tasks/new' },
    },
  },
  decorators: [
    (Story) => {
      const navigationProps = {
        projects,
        userName: '山田太郎',
        userEmail: 'yamada@example.test',
      };
      return (
        <div className="min-h-screen bg-slate-50 text-foreground lg:flex">
          <ProjectsSidebar {...navigationProps} />
          <div className="min-w-0 flex-1">
            <AppHeader {...navigationProps} />
            <main>
              <Story />
            </main>
          </div>
        </div>
      );
    },
  ],
  args: {
    projectId: 'project-1',
    projectName: 'Task Management App',
    projectKey: 'APP',
    reporterName: '山田太郎',
    assignees: [
      { id: 'user-1', name: '山田太郎' },
      { id: 'user-2', name: '佐藤花子' },
      { id: 'user-3', name: null },
    ],
  },
} satisfies Meta<typeof CreateTask>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutUserNames: Story = {
  args: { reporterName: null, assignees: [{ id: 'user-1', name: null }] },
};

export const LongNames: Story = {
  args: {
    projectName: 'LongProjectNameWithoutSpaces'.repeat(5),
    reporterName: 'LongReporterNameWithoutSpaces'.repeat(5),
    assignees: [
      { id: 'user-1', name: 'LongAssigneeNameWithoutSpaces'.repeat(5) },
    ],
  },
};

export const Disabled: Story = { args: { disabled: true } };

export const Submitting: Story = {
  beforeEach: () => {
    mocked(createTask).mockImplementation(() => new Promise(() => {}));
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'タイトル' }),
      'ログイン画面を作る',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'タスクを作成' }));
  },
};

export const SubmissionError: Story = {
  beforeEach: () => {
    const error = Object.assign(
      new Error('アーカイブ済みのプロジェクトにはタスクを作成できません'),
      { statusCode: 409 },
    );
    // Storybookはクラスもモック化するため、constructorを呼ばず判定用のprototypeを合わせる。
    Object.setPrototypeOf(error, CreateTaskRequestError.prototype);
    mocked(createTask).mockRejectedValue(error);
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByRole('textbox', { name: 'タイトル' }),
      'ログイン画面を作る',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'タスクを作成' }));
    await canvas.findByRole('alert');
  },
};
