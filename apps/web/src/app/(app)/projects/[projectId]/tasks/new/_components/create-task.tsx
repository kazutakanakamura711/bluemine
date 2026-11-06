import Link from 'next/link';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { CreateTaskForm } from './create-task-form';

type CreateTaskProps = {
  projectId: string;
  projectName: string;
  projectKey: string;
  reporterName: string | null;
  assignees: { id: string; name: string | null }[];
  disabled?: boolean;
};

// パンくずとページ見出しはServer Componentのまま、操作が必要なフォームだけを分ける。
export function CreateTask({
  projectId,
  projectName,
  projectKey,
  reporterName,
  assignees,
  disabled = false,
}: CreateTaskProps) {
  const tasksPath = `/projects/${encodeURIComponent(projectId)}/tasks`;
  return (
    <>
      <header className="flex min-h-20 min-w-0 flex-col justify-center gap-1 border-b border-border bg-background px-4 py-3 sm:px-6">
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
              <BreadcrumbPage>タスク作成</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <h1 className="text-base font-semibold tracking-tight">タスク作成</h1>
        <p className="text-xs text-muted-foreground wrap-anywhere">
          {projectKey} プロジェクト
        </p>
      </header>

      <CreateTaskForm
        key={projectId}
        projectId={projectId}
        reporterName={reporterName}
        assignees={assignees}
        disabled={disabled}
      />
    </>
  );
}
