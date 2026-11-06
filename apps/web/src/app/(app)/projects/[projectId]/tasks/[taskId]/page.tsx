import { notFound } from 'next/navigation';

import { getProject } from '../../_lib/get-project';
import { getProjectMembers } from '../../members/_lib/get-project-members';
import { TaskDetail } from './_components/task-detail';
import { getTask } from './_lib/get-task';
import { EditTaskSheet } from './_components/edit-task-sheet';
import { ProjectRole } from '@/features/projects/types/project-role';

type TaskDetailPageProps = {
  params: Promise<{ projectId: string; taskId: string }>;
};

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { projectId, taskId } = await params;
  const project = await getProject(projectId);

  if (project === null) {
    notFound();
  }

  const task = await getTask(project.id, taskId);

  if (task === null) {
    notFound();
  }

  const canEditTask =
    !project.isArchived &&
    (project.currentUserRole === ProjectRole.Owner ||
      project.currentUserRole === ProjectRole.Member);

  // 編集可能な場合だけ担当者候補を取得し、Client ComponentにはID・名前だけを渡す。
  const members = canEditTask ? await getProjectMembers(project.id) : [];
  if (members === null) notFound();

  return (
    <TaskDetail
      task={task}
      projectKey={project.key}
      projectName={project.name}
      isArchived={project.isArchived}
      headerAction={
        canEditTask ? (
          <EditTaskSheet
            task={task}
            assignees={members.map((member) => ({
              id: member.userId,
              name: member.user.name,
            }))}
          />
        ) : undefined
      }
    />
  );
}
