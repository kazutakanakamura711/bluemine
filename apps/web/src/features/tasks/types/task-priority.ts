export const TaskPriority = {
  Low: 'low',
  Normal: 'normal',
  High: 'high',
} as const;

export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const TaskPriorityDisplayText = {
  [TaskPriority.Low]: '低',
  [TaskPriority.Normal]: '通常',
  [TaskPriority.High]: '高',
} satisfies Record<TaskPriority, string>;
