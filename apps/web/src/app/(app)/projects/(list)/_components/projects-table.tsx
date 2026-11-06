'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useRouter } from 'next/navigation';
import type { KeyboardEvent } from 'react';

import type { Project } from '@/app/(app)/projects/_lib/get-projects';
import { formatDate } from '@/lib/format-date';

type ProjectsTableProps = {
  projects: Project[];
};

export function ProjectsTable({ projects }: ProjectsTableProps) {
  const router = useRouter();

  const navigateToProject = (projectId: string) => {
    router.push(`/projects/${projectId}`);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    projectId: string,
  ) => {
    // role="link" の行は、通常のリンクと同じく Enter キーで開けるようにする。
    if (event.key === 'Enter') {
      navigateToProject(projectId);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <Table aria-label="プロジェクト一覧" className="min-w-190">
        <TableHeader>
          <TableRow className="border-border bg-slate-50 hover:bg-slate-50">
            <TableHead className="w-20 px-4 text-xs text-muted-foreground">
              KEY
            </TableHead>
            <TableHead className="min-w-80 px-4 text-xs text-muted-foreground">
              プロジェクト名
            </TableHead>
            <TableHead className="w-28 px-4 text-xs text-muted-foreground">
              自分の権限
            </TableHead>
            <TableHead className="w-20 px-4 text-xs text-muted-foreground">
              タスク
            </TableHead>
            <TableHead className="w-28 px-4 text-xs text-muted-foreground">
              更新日
            </TableHead>
            <TableHead className="w-28 px-4 text-xs text-muted-foreground">
              状態
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow
              key={project.id}
              role="link"
              tabIndex={0}
              aria-label={`${project.name}の詳細を開く`}
              onClick={() => navigateToProject(project.id)}
              onKeyDown={(event) => handleKeyDown(event, project.id)}
              className={`cursor-pointer border-border transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600 ${
                project.isArchived ? 'opacity-50' : ''
              }`}
            >
              <TableCell className="px-4">
                <Badge
                  variant="outline"
                  className={
                    project.isArchived
                      ? 'border-transparent bg-muted text-muted-foreground'
                      : 'border-transparent bg-indigo-50 font-semibold text-indigo-600'
                  }
                >
                  {project.key}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-normal px-4 py-3">
                <p className="font-medium">{project.name}</p>
                <p className="mt-1 max-w-xl truncate text-sm text-muted-foreground">
                  {project.description ?? '説明はありません。'}
                </p>
              </TableCell>
              <TableCell className="px-4 text-muted-foreground">—</TableCell>
              <TableCell className="px-4 text-muted-foreground">—</TableCell>
              <TableCell className="px-4 text-muted-foreground">
                {formatDate(project.updatedAt)}
              </TableCell>
              <TableCell className="px-4">
                <Badge
                  variant="outline"
                  className={
                    project.isArchived
                      ? 'border-transparent bg-muted text-muted-foreground'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }
                >
                  {project.isArchived ? 'アーカイブ済み' : '進行中'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
