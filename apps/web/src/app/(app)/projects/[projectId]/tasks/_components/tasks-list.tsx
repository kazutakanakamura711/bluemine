import type { ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardList, TriangleAlert, UserRound } from 'lucide-react';
import { cn } from 'cn';

import type { Task } from '@/features/tasks/types/task';
import { TaskStatus } from '@/features/tasks/types/task-status';
import {
  TaskPriorityBadge,
  TaskStatusBadge,
} from '@/features/tasks/components/task-badges';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatDate,
  formatDateOnly,
  getTodayDateOnly,
  isDateOnlyBefore,
} from '@/lib/format-date';

type TasksListProps = {
  tasks: Task[];
  projectKey: string;
  headerAction?: ReactNode;
};

function TaskUserIdentity({ user }: { user: Task['assignee'] }) {
  if (user === null)
    return <span className="text-muted-foreground">未担当</span>;

  const name = user.name?.trim();

  return (
    <span className="inline-flex min-w-0 max-w-full items-start gap-1.5 align-top">
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] text-indigo-700"
      >
        {name ? (
          Array.from(name).slice(0, 2).join('')
        ) : (
          <UserRound className="size-3" />
        )}
      </span>
      <span className="min-w-0 leading-5 whitespace-normal wrap-anywhere">
        {name || '名前未設定'}
      </span>
    </span>
  );
}

function TaskDueDate({ task, today }: { task: Task; today: string }) {
  if (!task.dueDate) return <span className="text-slate-400">—</span>;

  const isOverdue =
    task.status !== TaskStatus.Done && isDateOnlyBefore(task.dueDate, today);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        isOverdue ? 'text-red-600' : 'text-slate-600',
      )}
    >
      {isOverdue && (
        <>
          <TriangleAlert aria-hidden="true" className="size-3 shrink-0" />
          <span className="sr-only">期限超過</span>
        </>
      )}
      <time dateTime={task.dueDate}>{formatDateOnly(task.dueDate)}</time>
    </span>
  );
}

export function TaskList({ tasks, projectKey, headerAction }: TasksListProps) {
  // 期限は時刻を持たない日付なので、日本時間の今日と日付同士で比較する。
  const today = getTodayDateOnly();

  return (
    <section aria-label="タスク一覧" className="min-w-0">
      <div className="flex min-h-12 items-center border-b border-border bg-background px-3 py-2 sm:px-6">
        <h2 className="sr-only">タスク</h2>
        <div className="ml-auto flex w-full flex-col items-end gap-2 md:w-auto md:flex-row md:gap-3">
          <p className="text-xs text-muted-foreground">{tasks.length}件</p>
          {headerAction && (
            <div className="w-full md:w-auto">{headerAction}</div>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <ClipboardList
            aria-hidden="true"
            className="mx-auto size-8 text-slate-400"
          />
          <p className="mt-3 text-sm text-muted-foreground">
            タスクはありません。
          </p>
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <Table
              aria-label="タスク一覧"
              className="min-w-4xl table-fixed bg-background"
            >
              <TableHeader>
                <TableRow className="border-border bg-slate-50 hover:bg-slate-50">
                  <TableHead className="w-24 px-3 text-xs text-slate-600">
                    番号
                  </TableHead>
                  <TableHead className="px-3 text-xs text-slate-600">
                    タイトル
                  </TableHead>
                  <TableHead className="w-28 px-3 text-xs text-slate-600">
                    ステータス
                  </TableHead>
                  <TableHead className="w-16 px-3 text-xs text-slate-600">
                    優先度
                  </TableHead>
                  <TableHead className="w-28 px-3 text-xs text-slate-600">
                    担当者
                  </TableHead>
                  <TableHead className="w-28 px-3 text-xs text-slate-600">
                    報告者
                  </TableHead>
                  <TableHead className="w-28 px-3 text-xs text-slate-600">
                    期限
                  </TableHead>
                  <TableHead className="w-24 px-3 text-xs text-slate-600">
                    更新日時
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id} className="border-slate-100">
                    <TableCell className="px-3 py-4 font-mono text-xs leading-5 whitespace-normal wrap-anywhere">
                      <Link
                        href={`/projects/${encodeURIComponent(task.projectId)}/tasks/${encodeURIComponent(task.id)}`}
                        className="rounded-sm text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                      >
                        {projectKey}-{task.number}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-normal px-3 py-4 leading-6 wrap-anywhere">
                      <Link
                        href={`/projects/${encodeURIComponent(task.projectId)}/tasks/${encodeURIComponent(task.id)}`}
                        className="rounded-sm hover:text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                      >
                        {task.title}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3 py-4">
                      <TaskStatusBadge status={task.status} />
                    </TableCell>
                    <TableCell className="px-3 py-4">
                      <TaskPriorityBadge priority={task.priority} />
                    </TableCell>
                    <TableCell className="px-3 py-4 text-xs text-slate-600">
                      <TaskUserIdentity user={task.assignee} />
                    </TableCell>
                    <TableCell className="px-3 py-4 text-xs text-slate-600">
                      <TaskUserIdentity user={task.reporter} />
                    </TableCell>
                    <TableCell className="px-3 py-4 text-xs text-slate-600">
                      <TaskDueDate task={task} today={today} />
                    </TableCell>
                    <TableCell className="px-3 py-4 text-xs text-slate-500">
                      <time dateTime={task.updatedAt}>
                        {formatDate(task.updatedAt)}
                      </time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul
            aria-label="タスク一覧（モバイル）"
            className="space-y-2 p-3 md:hidden"
          >
            {tasks.map((task) => (
              <li
                key={task.id}
                className="min-w-0 rounded-sm border border-slate-200 bg-background p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/projects/${encodeURIComponent(task.projectId)}/tasks/${encodeURIComponent(task.id)}`}
                      className="rounded-sm font-mono text-xs text-indigo-600 wrap-anywhere hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                    >
                      {projectKey}-{task.number}
                    </Link>
                    <h3 className="mt-1 text-sm font-medium leading-5 wrap-anywhere">
                      <Link
                        href={`/projects/${encodeURIComponent(task.projectId)}/tasks/${encodeURIComponent(task.id)}`}
                        className="rounded-sm hover:text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                      >
                        {task.title}
                      </Link>
                    </h3>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </div>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <TaskPriorityBadge priority={task.priority} />
                  <p className="text-xs text-slate-600">
                    <span className="sr-only">期限 </span>
                    <TaskDueDate task={task} today={today} />
                  </p>
                </div>
                <p className="mt-2 flex min-w-0 items-start gap-2 text-xs text-slate-600">
                  <span className="shrink-0 text-muted-foreground">担当者</span>
                  <TaskUserIdentity user={task.assignee} />
                </p>
                <p className="mt-2 flex min-w-0 items-start gap-2 text-xs text-slate-600">
                  <span className="shrink-0 text-muted-foreground">報告者</span>
                  <TaskUserIdentity user={task.reporter} />
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
