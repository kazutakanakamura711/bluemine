import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  TaskPriorityBadge,
  TaskStatusBadge,
} from '@/features/tasks/components/task-badges';
import type { Task } from '@/features/tasks/types/task';
import { formatDateOnly, formatDateTime } from '@/lib/format-date';

type TaskDetailProps = {
  task: Task;
  projectKey: string;
  projectName: string;
  isArchived: boolean;
  headerAction?: React.ReactNode;
};

function TaskDate({ value }: { value: string | null }) {
  // 開始日・期限は時刻を持たないため、タイムゾーン変換せず表示する。
  return value ? (
    <time dateTime={value}>{formatDateOnly(value)}</time>
  ) : (
    <span className="text-muted-foreground">未設定</span>
  );
}

export function TaskDetail({
  task,
  projectKey,
  projectName,
  isArchived,
  headerAction,
}: TaskDetailProps) {
  const tasksPath = `/projects/${encodeURIComponent(task.projectId)}/tasks`;

  return (
    <>
      <header className="flex min-h-18 min-w-0 flex-col justify-center gap-1 border-b border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0 space-y-1">
          <Breadcrumb aria-label="パンくずリスト">
            <BreadcrumbList className="gap-1 text-xs">
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link href="/projects" />}>
                  プロジェクト一覧
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbLink
                  render={<Link href={tasksPath} />}
                  className="wrap-anywhere"
                >
                  {projectName}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {projectKey}-{task.number}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h1 className="text-base font-semibold tracking-tight">
            {projectKey}-{task.number}
          </h1>
        </div>
        {headerAction && (
          <div className="mt-2 flex shrink-0 items-center gap-2 sm:mt-0">
            {headerAction}
          </div>
        )}
      </header>

      {isArchived && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-6"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          <p>
            このプロジェクトはアーカイブ済みです。タスクの作成・更新操作は無効化されています。
          </p>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 items-start gap-6 p-4 sm:p-6 lg:grid-cols-3">
        <article
          aria-labelledby="task-title"
          className="min-w-0 rounded-sm border border-border bg-background p-5 lg:col-span-2"
        >
          <h2
            id="task-title"
            className="text-lg font-semibold leading-7 wrap-anywhere"
          >
            {task.title}
          </h2>
          <p className="mt-4 text-sm leading-6 whitespace-pre-wrap wrap-anywhere text-slate-600">
            {task.description || '説明はありません。'}
          </p>
        </article>

        <aside
          aria-labelledby="task-properties-title"
          className="min-w-0 rounded-sm border border-border bg-background p-5 text-sm"
        >
          <h2
            id="task-properties-title"
            className="text-xs font-semibold text-muted-foreground"
          >
            属性
          </h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-xs text-muted-foreground">ステータス</dt>
              <dd className="mt-1">
                <TaskStatusBadge status={task.status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">優先度</dt>
              <dd className="mt-1">
                <TaskPriorityBadge
                  priority={task.priority}
                  className="w-full justify-start"
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">担当者</dt>
              <dd className="mt-1 wrap-anywhere">
                {task.assignee
                  ? task.assignee.name?.trim() || '名前未設定'
                  : '未担当'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">報告者</dt>
              <dd className="mt-1 wrap-anywhere">
                {task.reporter.name?.trim() || '名前未設定'}
              </dd>
            </div>
          </dl>
          <dl className="mt-4 space-y-4 border-t border-border pt-4">
            <div>
              <dt className="text-xs text-muted-foreground">開始日</dt>
              <dd className="mt-1">
                <TaskDate value={task.startDate} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">期限</dt>
              <dd className="mt-1">
                <TaskDate value={task.dueDate} />
              </dd>
            </div>
          </dl>
          <dl className="mt-4 space-y-4 border-t border-border pt-4">
            <div>
              <dt className="text-xs text-muted-foreground">
                作成日時（日本時間）
              </dt>
              <dd className="mt-1 text-xs leading-5 text-muted-foreground">
                <time dateTime={task.createdAt}>
                  {formatDateTime(task.createdAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                更新日時（日本時間）
              </dt>
              <dd className="mt-1 text-xs leading-5 text-muted-foreground">
                <time dateTime={task.updatedAt}>
                  {formatDateTime(task.updatedAt)}
                </time>
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </>
  );
}
