import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Plus } from 'lucide-react';
import { cn } from 'cn';

import { buttonVariants } from '@/components/ui/button';
import { ProjectRole } from '@/features/projects/types/project-role';
import { getProject } from '../_lib/get-project';
import { ProjectDetailHeader } from '../_components/project-detail-header';
import {
  ProjectDetailTabs,
  ProjectTabs,
} from '../_components/project-detail-tabs';
import { TaskList } from './_components/tasks-list';
import { getTasks } from './_lib/get-tasks';

type ProjectTasksPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectTasksPage({
  params,
}: ProjectTasksPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  const tasks = await getTasks(project.id);

  // 空配列は取得成功。null は API の404なので、空状態とは区別する。
  if (tasks === null) {
    notFound();
  }

  // Projectの情報を持つpageで、作成画面への入口を表示できるか判断する。
  const canCreateTask =
    !project.isArchived &&
    (project.currentUserRole === ProjectRole.Owner ||
      project.currentUserRole === ProjectRole.Member);

  return (
    <>
      <ProjectDetailHeader
        name={project.name}
        projectKey={project.key}
        isArchived={project.isArchived}
        currentUserRole={project.currentUserRole}
      />
      <ProjectDetailTabs
        projectId={project.id}
        activeTab={ProjectTabs.Task}
        currentUserRole={project.currentUserRole}
      />
      <TaskList
        tasks={tasks}
        projectKey={project.key}
        headerAction={
          canCreateTask ? (
            <Link
              href={`/projects/${encodeURIComponent(project.id)}/tasks/new`}
              className={cn(
                buttonVariants(),
                'h-9 w-full rounded-sm bg-indigo-600 text-xs text-white hover:bg-indigo-700 md:h-8 md:w-auto',
              )}
            >
              <Plus aria-hidden="true" className="size-3.5" />
              タスク作成
            </Link>
          ) : undefined
        }
      />
    </>
  );
}
