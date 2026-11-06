import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectRole } from '@/features/projects/types/project-role';
import {
  ProjectDetailTabs,
  ProjectTabs,
  ProjectTabsDisplayText,
} from './project-detail-tabs';

describe('ProjectDetailTabs', () => {
  it('ownerにタスク・メンバー・設定のリンクを表示する', () => {
    render(
      <ProjectDetailTabs
        projectId="project-id"
        activeTab={ProjectTabs.Task}
        currentUserRole={ProjectRole.Owner}
      />,
    );

    const navigation = screen.getByRole('navigation', {
      name: 'プロジェクト詳細',
    });
    expect(within(navigation).getAllByRole('link')).toHaveLength(3);
    expect(
      within(navigation).getByRole('link', { name: 'タスク' }),
    ).toHaveAttribute('href', '/projects/project-id/tasks');
    expect(
      within(navigation).getByRole('link', { name: 'メンバー' }),
    ).toHaveAttribute('href', '/projects/project-id/members');
    expect(
      within(navigation).getByRole('link', { name: '設定' }),
    ).toHaveAttribute('href', '/projects/project-id/setting');
  });

  it.each([ProjectRole.Member, ProjectRole.Viewer])(
    '%sにはタスク・メンバーを表示し、設定は表示しない',
    (currentUserRole) => {
      render(
        <ProjectDetailTabs
          projectId="project-id"
          activeTab={ProjectTabs.Member}
          currentUserRole={currentUserRole}
        />,
      );

      expect(screen.getByRole('link', { name: 'タスク' })).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'メンバー' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: '設定' }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('link')).toHaveLength(2);
    },
  );

  it.each([ProjectTabs.Task, ProjectTabs.Member, ProjectTabs.Setting])(
    '%sを表示中の場合は、そのリンクだけにaria-currentを付ける',
    (activeTab) => {
      render(
        <ProjectDetailTabs
          projectId="project-id"
          activeTab={activeTab}
          currentUserRole={ProjectRole.Owner}
        />,
      );

      expect(
        screen.getByRole('link', { current: 'page' }),
      ).toHaveAccessibleName(ProjectTabsDisplayText[activeTab]);
      expect(screen.getAllByRole('link', { current: 'page' })).toHaveLength(1);
    },
  );

  it('projectIdをURLのパス要素としてエンコードする', () => {
    render(
      <ProjectDetailTabs
        projectId="project/id?draft#1"
        activeTab={ProjectTabs.Task}
        currentUserRole={ProjectRole.Owner}
      />,
    );

    expect(screen.getByRole('link', { name: 'メンバー' })).toHaveAttribute(
      'href',
      '/projects/project%2Fid%3Fdraft%231/members',
    );
    expect(screen.getByRole('link', { name: '設定' })).toHaveAttribute(
      'href',
      '/projects/project%2Fid%3Fdraft%231/setting',
    );
  });
});
