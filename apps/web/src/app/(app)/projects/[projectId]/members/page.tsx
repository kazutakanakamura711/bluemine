import { notFound } from 'next/navigation';
import { getProject } from '../_lib/get-project';
import { getProjectMembers } from './_lib/get-project-members';
import { ProjectRole } from '@/features/projects/types/project-role';
import { ProjectDetailHeader } from '../_components/project-detail-header';
import {
  ProjectDetailTabs,
  ProjectTabs,
} from '../_components/project-detail-tabs';
import { ProjectMembersList } from './_components/project-members-list';
import { AddProjectMemberDialog } from './_components/add-project-member-dialog';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { createClient } from '@/lib/supabase/server';

type ProjectMembersPageProps = {
  params: Promise<{
    projectId: string;
  }>;
};

export default async function ProjectMembersPage({
  params,
}: ProjectMembersPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  const projectMembers = await getProjectMembers(project.id);

  if (!projectMembers) {
    notFound();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    throw new Error('ログインセッションを取得できませんでした。');
  }

  const accessToken = data.session.access_token;
  const currentUser = await getCurrentUser(accessToken);

  return (
    <>
      <ProjectDetailHeader
        name={project.name}
        projectKey={project.key}
        isArchived={project.isArchived}
      />

      <ProjectDetailTabs
        projectId={project.id}
        activeTab={ProjectTabs.Member}
        currentUserRole={project.currentUserRole}
      />
      <div className="p-4 sm:p-6">
        <div className="max-w-200">
          <ProjectMembersList
            projectId={project.id}
            members={projectMembers}
            currentUserId={currentUser.id}
            currentUserRole={project.currentUserRole}
            isArchived={project.isArchived}
            headerAction={
              project.currentUserRole === ProjectRole.Owner ? (
                <AddProjectMemberDialog
                  projectId={project.id}
                  isArchived={project.isArchived}
                />
              ) : undefined
            }
          />
        </div>
      </div>
    </>
  );
}
