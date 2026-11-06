'use client';

import { useRouter } from 'next/navigation';

import type { Project } from '@/app/(app)/projects/_lib/get-projects';

import { ProjectArchive } from './project-archive';
import { ProjectSettingsForm } from './project-settings-form';
import { ProjectUnarchive } from './project-unarchive';

type ProjectSettingsPanelProps = {
  project: Project;
};

export function ProjectSettingsPanel({ project }: ProjectSettingsPanelProps) {
  const router = useRouter();

  const handleArchiveStateChanged = () => {
    router.replace(`/projects/${encodeURIComponent(project.id)}/tasks`);
  };

  return (
    <>
      <ProjectSettingsForm
        projectId={project.id}
        initialName={project.name}
        projectKey={project.key}
        initialDescription={project.description}
      />
      {project.isArchived ? (
        <ProjectUnarchive
          projectId={project.id}
          onUnarchived={handleArchiveStateChanged}
        />
      ) : (
        <ProjectArchive
          projectId={project.id}
          projectName={project.name}
          onArchived={handleArchiveStateChanged}
        />
      )}
    </>
  );
}
