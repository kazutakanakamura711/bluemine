import { Badge } from '@/components/ui/badge';
import { cn } from 'cn';
import { TaskStatus, TaskStatusDisplayText } from '../types/task-status';
import { TaskPriority, TaskPriorityDisplayText } from '../types/task-priority';

const statusClassName = {
  [TaskStatus.Todo]: 'border-slate-200 bg-slate-100 text-slate-600',
  [TaskStatus.InProgress]: 'border-blue-200 bg-blue-50 text-blue-700',
  [TaskStatus.Done]: 'border-emerald-200 bg-emerald-50 text-emerald-700',
} satisfies Record<TaskStatus, string>;

const priorityClassName = {
  [TaskPriority.Low]: 'border-slate-200 bg-slate-50 text-slate-500',
  [TaskPriority.Normal]: 'border-blue-200 bg-blue-50 text-blue-700',
  [TaskPriority.High]: 'border-amber-200 bg-amber-50 text-amber-700',
} satisfies Record<TaskPriority, string>;

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge
      variant="outline"
      className={`gap-1 rounded-sm px-1.5 text-xs ${statusClassName[status]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {TaskStatusDisplayText[status]}
    </Badge>
  );
}

export function TaskPriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'rounded-sm px-1.5 text-xs',
        priorityClassName[priority],
        className,
      )}
    >
      {TaskPriorityDisplayText[priority]}
    </Badge>
  );
}
