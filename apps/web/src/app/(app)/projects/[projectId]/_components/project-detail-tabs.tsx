import Link from 'next/link';
import { ClipboardList, Settings, Users } from 'lucide-react';
import { cn } from 'cn';

import { ProjectRole } from '@/features/projects/types/project-role';

export const ProjectTabs = {
  Task: 'task',
  Member: 'member',
  Setting: 'setting',
} as const;

export type ProjectTab = (typeof ProjectTabs)[keyof typeof ProjectTabs];

export const ProjectTabsDisplayText = {
  [ProjectTabs.Task]: 'タスク',
  [ProjectTabs.Member]: 'メンバー',
  [ProjectTabs.Setting]: '設定',
} satisfies Record<ProjectTab, string>;

type ProjectDetailTabsProps = {
  projectId: string;
  activeTab: ProjectTab;
  currentUserRole: ProjectRole;
};

export function ProjectDetailTabs({
  projectId,
  activeTab,
  currentUserRole,
}: ProjectDetailTabsProps) {
  const projectPath = `/projects/${encodeURIComponent(projectId)}`;
  const tabs = [
    {
      value: ProjectTabs.Task,
      href: `${projectPath}/tasks`,
      icon: ClipboardList,
    },
    {
      value: ProjectTabs.Member,
      href: `${projectPath}/members`,
      icon: Users,
    },
    {
      value: ProjectTabs.Setting,
      href: `${projectPath}/setting`,
      icon: Settings,
    },
  ];

  return (
    <nav
      aria-label="プロジェクト詳細"
      className="overflow-x-auto border-b border-border bg-background"
    >
      <ul className="flex h-11 px-5 sm:px-6">
        {tabs
          .filter(
            (tab) =>
              tab.value !== ProjectTabs.Setting ||
              currentUserRole === ProjectRole.Owner,
          )
          .map(({ value, href, icon: Icon }) => (
            <li key={value} className="shrink-0">
              <Link
                href={href}
                aria-current={activeTab === value ? 'page' : undefined}
                className={cn(
                  'inline-flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600 sm:px-4',
                  activeTab === value
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-muted-foreground',
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {ProjectTabsDisplayText[value]}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}
