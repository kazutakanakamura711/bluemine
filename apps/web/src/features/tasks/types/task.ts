import type { TaskPriority } from './task-priority';
import type { TaskStatus } from './task-status';

type TaskUser = {
  id: string;
  name: string | null;
};

export type Task = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: TaskUser | null;
  reporter: TaskUser;
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
};
