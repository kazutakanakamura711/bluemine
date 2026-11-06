import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { unarchiveProject } from '../_lib/unarchive-project';
import { ProjectUnarchive } from './project-unarchive';

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  add: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

vi.mock('../_lib/unarchive-project', () => ({
  unarchiveProject: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: {
    add: toastMocks.add,
  },
}));

const unarchiveProjectMock = vi.mocked(unarchiveProject);

const defaultProps = {
  projectId: 'project-id',
  onUnarchived: vi.fn(),
};

describe('ProjectUnarchive', () => {
  beforeEach(() => {
    unarchiveProjectMock.mockReset();
    defaultProps.onUnarchived.mockReset();
    routerMocks.refresh.mockReset();
    toastMocks.add.mockReset();
  });

  it('解除処理中はボタンを無効化して処理中と表示する', async () => {
    let resolveUnarchive!: () => void;
    unarchiveProjectMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveUnarchive = resolve;
      }),
    );

    render(<ProjectUnarchive {...defaultProps} />);
    const user = userEvent.setup();
    const unarchiveButton = screen.getByRole('button', {
      name: 'アーカイブを解除',
    });

    await user.click(unarchiveButton);

    expect(unarchiveButton).toBeDisabled();
    expect(unarchiveButton).toHaveTextContent('処理中...');

    resolveUnarchive();

    await waitFor(() => {
      expect(unarchiveButton).toBeEnabled();
    });
  });

  it('解除に成功した場合はトーストを表示してタスク画面へ切り替える', async () => {
    unarchiveProjectMock.mockResolvedValue(undefined);
    render(<ProjectUnarchive {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'アーカイブを解除' }));

    await waitFor(() => {
      expect(unarchiveProjectMock).toHaveBeenCalledWith('project-id');
      expect(toastMocks.add).toHaveBeenCalledWith({
        type: 'success',
        title: 'プロジェクトのアーカイブを解除しました',
      });
      expect(defaultProps.onUnarchived).toHaveBeenCalledOnce();
      expect(routerMocks.refresh).toHaveBeenCalledOnce();
    });
  });

  it('APIエラーの場合はAPIのメッセージを表示する', async () => {
    unarchiveProjectMock.mockRejectedValue(
      new ProjectRequestError('プロジェクトが見つかりません', 404),
    );
    render(<ProjectUnarchive {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'アーカイブを解除' }));

    expect(
      await screen.findByText('プロジェクトが見つかりません'),
    ).toBeInTheDocument();
    expect(toastMocks.add).not.toHaveBeenCalled();
    expect(defaultProps.onUnarchived).not.toHaveBeenCalled();
    expect(routerMocks.refresh).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'アーカイブを解除' }),
    ).toBeEnabled();
  });

  it('通信に失敗した場合は日本語の案内を表示する', async () => {
    unarchiveProjectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ProjectUnarchive {...defaultProps} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'アーカイブを解除' }));

    expect(
      await screen.findByText(
        '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
      ),
    ).toBeInTheDocument();
    expect(toastMocks.add).not.toHaveBeenCalled();
    expect(defaultProps.onUnarchived).not.toHaveBeenCalled();
    expect(routerMocks.refresh).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'アーカイブを解除' }),
    ).toBeEnabled();
  });
});
