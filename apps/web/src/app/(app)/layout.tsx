import { Suspense, type ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { createClient } from '@/lib/supabase/server';

import { AppHeader } from './_components/app-header';
import { ProjectsSidebar } from './_components/projects-sidebar';
import { getProjects } from './projects/_lib/get-projects';

async function ProjectsNavigationContainer() {
  // Cookie を参照できるサーバー用クライアントで、セッションを取得する。
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error || !accessToken) {
    throw new Error('ログインセッションを取得できませんでした。');
  }

  // token は NestJS で検証する。セッション内の user をそのまま表示には使わない。
  const [projects, currentUser] = await Promise.all([
    getProjects().catch(() => []),
    getCurrentUser(accessToken),
  ]);

  // 両方のコンポーネントに渡す表示用データ。
  const navigationProps = {
    projects,
    userName: currentUser.name ?? 'ユーザー',
    userEmail: currentUser.email,
  };

  return (
    <>
      <ProjectsSidebar {...navigationProps} />
      <AppHeader {...navigationProps} />
    </>
  );
}

function ProjectsSidebarFallback() {
  return (
    <aside
      aria-hidden="true"
      className="hidden min-h-screen w-56 shrink-0 border-r border-border bg-background lg:block"
    />
  );
}

function ProjectsAppHeaderFallback() {
  return (
    <header
      aria-hidden="true"
      className="grid h-12 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2 border-b border-border bg-background px-3 lg:hidden"
    >
      <Skeleton className="size-9 rounded-md" />
      <Skeleton className="h-6 w-36 max-w-full justify-self-center rounded-md" />
      <Skeleton className="size-7 justify-self-end rounded-full" />
    </header>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-foreground lg:flex">
      <Suspense
        fallback={
          <>
            <ProjectsSidebarFallback />
            <ProjectsAppHeaderFallback />
          </>
        }
      >
        <ProjectsNavigationContainer />
      </Suspense>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
