import { notFound } from 'next/navigation';

import { ProjectRole } from '@/features/projects/types/project-role';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { createClient } from '@/lib/supabase/server';
import { getProject } from '../../_lib/get-project';
import { getProjectMembers } from '../../members/_lib/get-project-members';
import { CreateTask } from './_components/create-task';

type NewTaskPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function NewTaskPage({ params }: NewTaskPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const members = await getProjectMembers(project.id);
  if (members === null) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new Error('ログインセッションを取得できませんでした。');
  }
  const currentUser = await getCurrentUser(data.session.access_token);

  return (
    <CreateTask
      projectId={project.id}
      projectName={project.name}
      projectKey={project.key}
      reporterName={currentUser.name}
      assignees={members.map((member) => ({
        id: member.userId,
        name: member.user.name,
      }))}
      disabled={
        project.isArchived || project.currentUserRole === ProjectRole.Viewer
      }
    />
  );
}
