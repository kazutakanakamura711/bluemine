import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@/app/(app)/projects/_lib/get-projects';
import { ProjectSettingsPanel } from './project-settings-panel';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  archiveProject: vi.fn(),
  unarchiveProject: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock('../_lib/archive-project', () => ({
  archiveProject: mocks.archiveProject,
}));

vi.mock('../_lib/unarchive-project', () => ({
  unarchiveProject: mocks.unarchiveProject,
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { add: mocks.addToast },
}));

const project: Project = {
  id: 'project-id',
  key: 'TEST',
  name: 'テストプロジェクト',
  description: null,
  isArchived: false,
  createdAt: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-10-18T00:00:00.000Z',
};

describe('ProjectSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.archiveProject.mockResolvedValue(undefined);
    mocks.unarchiveProject.mockResolvedValue(undefined);
  });

  it('アーカイブに成功すると設定URLをタスクURLに置き換える', async () => {
    const user = userEvent.setup();
    render(<ProjectSettingsPanel project={project} />);

    await user.click(screen.getByRole('button', { name: 'アーカイブ' }));
    await user.type(
      screen.getByLabelText(
        /確認のため.*テストプロジェクト.*と入力してください/,
      ),
      project.name,
    );
    await user.click(screen.getByRole('button', { name: 'アーカイブする' }));

    await waitFor(() => {
      expect(mocks.archiveProject).toHaveBeenCalledWith(project.id);
      expect(mocks.replace).toHaveBeenCalledWith('/projects/project-id/tasks');
      expect(mocks.refresh).toHaveBeenCalledOnce();
    });
  });

  it('アーカイブ解除に成功するとエンコードしたタスクURLへ戻る', async () => {
    const user = userEvent.setup();
    render(
      <ProjectSettingsPanel
        project={{ ...project, id: 'project/id', isArchived: true }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'アーカイブを解除' }));

    await waitFor(() => {
      expect(mocks.unarchiveProject).toHaveBeenCalledWith('project/id');
      expect(mocks.replace).toHaveBeenCalledWith(
        '/projects/project%2Fid/tasks',
      );
      expect(mocks.refresh).toHaveBeenCalledOnce();
    });
  });
});
