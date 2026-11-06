import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import {
  type ProjectRole,
  ProjectRoleDisplayText,
} from '@/features/projects/types/project-role';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb';

type ProjectDetailHeaderProps = {
  name: string;
  projectKey: string;
  isArchived: boolean;
  currentUserRole?: ProjectRole;
};

export function ProjectDetailHeader({
  name,
  projectKey,
  isArchived,
  currentUserRole,
}: ProjectDetailHeaderProps) {
  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="flex min-h-23 items-center px-5 py-3 sm:px-6">
          <div className="min-w-0 wrap-anywhere">
            <Breadcrumb className="text-xs">
              <BreadcrumbList className="gap-1 text-xs">
                <BreadcrumbItem>
                  <BreadcrumbLink
                    render={<Link href="/projects" />}
                    className="hover:text-indigo-600"
                  >
                    プロジェクト一覧
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator>/</BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>{name}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <h1 className="mt-1 text-lg font-semibold tracking-tight">
              {name}
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {projectKey}
              {currentUserRole &&
                ` · ${ProjectRoleDisplayText[currentUserRole]}として参加中`}
            </p>
          </div>
        </div>
      </header>

      {isArchived && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-950 sm:px-6"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          <p>
            このプロジェクトはアーカイブ済みです。タスクの作成・更新操作は無効化されています。
          </p>
        </div>
      )}
    </>
  );
}
