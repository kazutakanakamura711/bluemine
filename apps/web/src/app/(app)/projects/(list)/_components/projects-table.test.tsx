import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@/app/(app)/projects/_lib/get-projects';
import { ProjectsTable } from './projects-table';

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

const project: Project = {
  id: 'project-id',
  key: 'PROJECT',
  name: 'テストプロジェクト',
  description: 'テスト用の説明',
  isArchived: false,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
};

describe('ProjectsTable', () => {
  beforeEach(() => {
    routerMocks.push.mockReset();
  });

  it('行をクリックするとプロジェクト詳細へ遷移する', () => {
    render(<ProjectsTable projects={[project]} />);

    fireEvent.click(
      screen.getByRole('link', { name: 'テストプロジェクトの詳細を開く' }),
    );

    expect(routerMocks.push).toHaveBeenCalledWith('/projects/project-id');
  });

  it('行でEnterキーを押すとプロジェクト詳細へ遷移する', () => {
    render(<ProjectsTable projects={[project]} />);

    fireEvent.keyDown(
      screen.getByRole('link', { name: 'テストプロジェクトの詳細を開く' }),
      { key: 'Enter' },
    );

    expect(routerMocks.push).toHaveBeenCalledWith('/projects/project-id');
  });
});
