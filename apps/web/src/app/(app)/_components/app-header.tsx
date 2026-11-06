'use client';

import { Archive, ClipboardList, Folder, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Project } from '@/app/(app)/projects/_lib/get-projects';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { UserMenu } from './user-menu';

type AppHeaderProps = {
  projects: Project[];
  userName: string;
  userEmail: string;
};

export function AppHeader({ projects, userName, userEmail }: AppHeaderProps) {
  const pathname = usePathname();
  const isProjectsListPage = pathname === '/projects';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const handleMenuOpenChange = (open: boolean) => {
    setIsMenuOpen(open);
    // Sheet の外に描画される小メニューも、Sheet と一緒に閉じる。
    if (!open) setIsUserMenuOpen(false);
  };

  useEffect(() => {
    // サイドバーが表示される PC 幅では、開いている Sheet を閉じる。
    const desktopQuery = window.matchMedia('(min-width: 64rem)');
    const closeMenuOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMenuOpen(false);
        setIsUserMenuOpen(false);
      }
    };

    desktopQuery.addEventListener('change', closeMenuOnDesktop);
    return () => desktopQuery.removeEventListener('change', closeMenuOnDesktop);
  }, []);

  return (
    <Sheet open={isMenuOpen} onOpenChange={handleMenuOpenChange}>
      <header className="grid h-12 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2 border-b border-border bg-background px-3 lg:hidden">
        <SheetTrigger
          aria-label="メニューを開く"
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="rounded-md text-muted-foreground focus-visible:ring-2 focus-visible:ring-indigo-600"
            />
          }
        >
          <Menu aria-hidden="true" className="size-5" />
        </SheetTrigger>

        <div className="flex min-w-0 items-center justify-self-center gap-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white">
            <ClipboardList aria-hidden="true" className="size-3.5" />
          </div>
          <p className="truncate text-sm font-semibold tracking-tight">
            Bluemine
          </p>
        </div>

        <span
          role="img"
          aria-label={`ログインユーザー：${userName}`}
          className="flex size-7 items-center justify-center justify-self-end rounded-full bg-indigo-100 text-xs font-medium text-indigo-700"
        >
          {userName.slice(0, 1)}
        </span>
      </header>

      <SheetContent
        side="left"
        showCloseButton={false}
        keepMounted
        overlayClassName="bg-slate-950/35 supports-backdrop-filter:backdrop-blur-none"
        className="gap-0 overflow-hidden bg-background p-0 data-[side=left]:w-[min(18rem,86vw)] data-[side=left]:sm:max-w-none"
      >
        <SheetHeader className="shrink-0 flex-row items-center justify-between border-b border-border px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-white">
              <ClipboardList aria-hidden="true" className="size-3.5" />
            </span>
            Bluemine
          </SheetTitle>
          <SheetDescription className="sr-only">
            プロジェクト画面に移動するメニューです。
          </SheetDescription>
          <SheetClose
            aria-label="メニューを閉じる"
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="rounded-md text-muted-foreground"
              />
            }
          >
            <X aria-hidden="true" className="size-5" />
          </SheetClose>
        </SheetHeader>

        <nav
          aria-label="メインナビゲーション"
          className="min-h-0 flex-1 overflow-y-auto px-2 py-3"
        >
          <Link
            href="/projects"
            onClick={() => handleMenuOpenChange(false)}
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
                    onClick={() => handleMenuOpenChange(false)}
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

        {/* リスト部分が残りの高さを使い、ユーザーメニューを最下部に置く。 */}
        <div className="shrink-0 border-t border-border p-3">
          <UserMenu
            userName={userName}
            userEmail={userEmail}
            open={isMenuOpen && isUserMenuOpen}
            onOpenChange={setIsUserMenuOpen}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
