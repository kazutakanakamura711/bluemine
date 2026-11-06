import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProjectDetailHeader } from './project-detail-header';

const project = {
  name: 'テストプロジェクト',
  key: 'TEST',
  isArchived: false,
};

describe('ProjectDetailHeader', () => {
  it('プロジェクト名・キーと一覧へ戻るリンクを表示する', () => {
    render(
      <ProjectDetailHeader
        name={project.name}
        projectKey={project.key}
        isArchived={project.isArchived}
      />,
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'テストプロジェクト',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('TEST')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'プロジェクト一覧' }),
    ).toHaveAttribute('href', '/projects');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('アーカイブ済みの場合は案内を表示する', () => {
    render(
      <ProjectDetailHeader
        name={project.name}
        projectKey={project.key}
        isArchived={true}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'このプロジェクトはアーカイブ済みです。タスクの作成・更新操作は無効化されています。',
    );
  });
});
