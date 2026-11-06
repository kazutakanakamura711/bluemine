export const TaskStatus = {
  Todo: 'todo',
  InProgress: 'in_progress',
  Done: 'done',
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TaskStatusDisplayText = {
  [TaskStatus.Todo]: '未着手',
  [TaskStatus.InProgress]: '進行中',
  [TaskStatus.Done]: '完了',
} satisfies Record<TaskStatus, string>;
