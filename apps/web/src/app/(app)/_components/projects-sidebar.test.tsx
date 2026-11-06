import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@/app/(app)/projects/_lib/get-projects';
import { ProjectsSidebar } from './projects-sidebar';

const navigationMocks = vi.hoisted(() => ({
  pathname: '/projects/project-id',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => navigationMocks.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const project: Project = {
  id: 'project-id',
  key: 'LONGPROJECTKEY1234567',
  name: 'とても長いプロジェクト名',
  description: null,
  isArchived: false,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

const userProps = {
  userName: '佐藤 花子',
  userEmail: 'sato@example.com',
};

describe('ProjectsSidebar', () => {
  beforeEach(() => {
    navigationMocks.pathname = '/projects/project-id';
  });

  it('長いプロジェクトキーを省略表示できる要素として描画する', () => {
    render(<ProjectsSidebar projects={[project]} {...userProps} />);

    expect(screen.getByTitle(project.key)).toHaveClass('w-10', 'truncate');
    expect(screen.getByText(project.name)).toHaveClass(
      'min-w-0',
      'flex-1',
      'truncate',
    );
  });

  it('プロジェクト詳細へのリンクを表示する', () => {
    render(<ProjectsSidebar projects={[project]} {...userProps} />);

    expect(
      screen.getByRole('link', { name: /とても長いプロジェクト名/ }),
    ).toHaveAttribute('href', '/projects/project-id');
  });

  it('現在表示中のプロジェクトを選択状態で表示する', () => {
    render(<ProjectsSidebar projects={[project]} {...userProps} />);

    expect(
      screen.getByRole('link', { name: /とても長いプロジェクト名/ }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('link', { name: /とても長いプロジェクト名/ }),
    ).toHaveClass('bg-indigo-50', 'text-indigo-700');
  });

  it('アーカイブ済みプロジェクトを補助テキスト付きで表示する', () => {
    render(
      <ProjectsSidebar
        projects={[{ ...project, isArchived: true }]}
        {...userProps}
      />,
    );

    expect(screen.getByText('アーカイブ済み')).toBeInTheDocument();
  });

  it('空のプロジェクト配列でも壊れず表示できる', () => {
    render(<ProjectsSidebar projects={[]} {...userProps} />);

    expect(
      screen.getByRole('navigation', { name: 'メインナビゲーション' }),
    ).toBeInTheDocument();
  });

  it('アーカイブ済み行が薄く表示される', () => {
    const archivedProject = { ...project, isArchived: true };

    render(<ProjectsSidebar projects={[archivedProject]} {...userProps} />);

    expect(screen.getByText(archivedProject.name).closest('li')).toHaveClass(
      'opacity-50',
    );
  });

  it('親から受け取ったログインユーザーの名前とメールアドレスを表示する', () => {
    render(<ProjectsSidebar projects={[]} {...userProps} />);

    expect(screen.getByText(userProps.userName)).toBeInTheDocument();
    expect(screen.getByText(userProps.userEmail)).toBeInTheDocument();
  });
});
