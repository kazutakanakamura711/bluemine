import { notFound, redirect } from 'next/navigation';

import { getProject } from '../_lib/get-project';
import { ProjectRole } from '@/features/projects/types/project-role';
import { ProjectDetailHeader } from '../_components/project-detail-header';
import {
  ProjectDetailTabs,
  ProjectTabs,
} from '../_components/project-detail-tabs';
import { ProjectSettingsPanel } from './_components/project-settings-panel';

type ProjectSettingPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectSettingPage({
  params,
}: ProjectSettingPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId);

  if (!project) {
    notFound();
  }

  if (project.currentUserRole !== ProjectRole.Owner) {
    redirect(`/projects/${encodeURIComponent(project.id)}/tasks`);
  }

  return (
    <>
      <ProjectDetailHeader
        name={project.name}
        projectKey={project.key}
        isArchived={project.isArchived}
      />
      <ProjectDetailTabs
        projectId={project.id}
        activeTab={ProjectTabs.Setting}
        currentUserRole={project.currentUserRole}
      />
      <div className="p-5 sm:p-6">
        <ProjectSettingsPanel project={project} />
      </div>
    </>
  );
}
