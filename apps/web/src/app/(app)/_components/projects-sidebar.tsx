'use client';

import { Archive, ClipboardList, Folder } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { Project } from '@/app/(app)/projects/_lib/get-projects';
import { UserMenu } from './user-menu';

type ProjectsSidebarProps = {
  projects: Project[];
  userName: string;
  userEmail: string;
};

export function ProjectsSidebar({
  projects,
  userName,
  userEmail,
}: ProjectsSidebarProps) {
  const pathname = usePathname();
  const isProjectsListPage = pathname === '/projects';

  return (
    <aside className="hidden min-h-screen w-56 shrink-0 flex-col border-r border-border bg-background lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-4">
        <div className="flex size-6 items-center justify-center rounded-md bg-indigo-600 text-white">
          <ClipboardList aria-hidden="true" className="size-4" />
        </div>
        <p className="text-sm font-semibold tracking-tight">Bluemine</p>
      </div>

      <nav aria-label="メインナビゲーション" className="flex-1 px-2 py-3">
        <Link
          href="/projects"
          aria-current={isProjectsListPage ? 'page' : undefined}
          className={`flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
            isProjectsListPage
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-muted-foreground hover:bg-slate-50 hover:text-indigo-600'
          }`}
        >
          <Folder aria-hidden="true" className="size-4" />
          プロジェクト一覧
        </Link>

        <p className="mt-4 px-2 text-xs font-medium text-muted-foreground">
          プロジェクト
        </p>
        <ul className="mt-2 space-y-1">
          {projects.map((project) => {
            const href = `/projects/${project.id}`;
            const isActive =
              pathname === href || pathname.startsWith(`${href}/`);

            return (
              <li
                key={project.id}
                className={project.isArchived ? 'opacity-50' : undefined}
              >
                <Link
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                    isActive
                      ? 'bg-indigo-50 font-medium text-indigo-700'
                      : 'text-muted-foreground hover:bg-slate-50 hover:text-indigo-600'
                  }`}
                >
                  <span
                    title={project.key}
                    className="w-10 shrink-0 truncate font-mono text-[11px] font-semibold text-indigo-500"
                  >
                    {project.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {project.name}
                  </span>
                  {project.isArchived ? (
                    <>
                      <Archive
                        aria-hidden="true"
                        className="ml-auto size-3.5"
                      />
                      <span className="sr-only">アーカイブ済み</span>
                    </>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <UserMenu userName={userName} userEmail={userEmail} />
      </div>
    </aside>
  );
}
