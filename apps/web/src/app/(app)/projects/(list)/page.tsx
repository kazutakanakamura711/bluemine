import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';

import { ProjectsTable } from './_components/projects-table';
import { getProjects } from '@/app/(app)/projects/_lib/get-projects';

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <>
      <header className="border-b border-border bg-background">
        <div className="flex min-h-16 items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              プロジェクト一覧
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {projects.length}件のプロジェクト
            </p>
          </div>
          <Button
            nativeButton={false}
            render={<Link href="/projects/new" />}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus aria-hidden="true" />
            新規プロジェクト
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8">
        {projects.length === 0 ? (
          <section className="rounded-lg border border-dashed border-border bg-background px-6 py-14 text-center">
            <h2 className="font-medium">プロジェクトはまだありません</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              プロジェクト作成画面の実装後、ここから追加できます。
            </p>
          </section>
        ) : (
          <ProjectsTable projects={projects} />
        )}
      </div>
    </>
  );
}
