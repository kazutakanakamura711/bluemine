import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { updateProject } from '../_lib/update-project';
import { ProjectSettingsForm } from './project-settings-form';

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  add: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

// 本物の API 通信を行わず、呼び出し内容だけをテストできるようにする。
vi.mock('../_lib/update-project', () => {
  return {
    updateProject: vi.fn(),
  };
});

// トースト表示自体ではなく、toast.add() が呼ばれたかを確認する。
vi.mock('@/components/ui/toast', () => ({
  toast: {
    add: toastMocks.add,
  },
}));

const updateProjectMock = vi.mocked(updateProject);

const defaultProps = {
  projectId: 'project-id',
  initialName: 'テストプロジェクト',
  projectKey: 'TEST',
  initialDescription: 'テスト用の説明',
};

describe('ProjectSettingsForm', () => {
  beforeEach(() => {
    updateProjectMock.mockReset();
    routerMocks.refresh.mockReset();
    toastMocks.add.mockReset();
  });

  it('現在のプロジェクト情報を初期値として表示する', () => {
    render(<ProjectSettingsForm {...defaultProps} />);

    expect(screen.getByLabelText(/^プロジェクト名/)).toHaveValue(
      'テストプロジェクト',
    );
    expect(screen.getByLabelText(/^プロジェクトキー/)).toHaveValue('TEST');
    expect(screen.getByLabelText(/^プロジェクトキー/)).toHaveAttribute(
      'readonly',
    );
    expect(screen.getByLabelText('説明')).toHaveValue('テスト用の説明');
  });

  it('プロジェクト名が空の場合はエラーを表示し、更新しない', async () => {
    const user = userEvent.setup();
    render(<ProjectSettingsForm {...defaultProps} />);

    await user.clear(screen.getByLabelText(/^プロジェクト名/));
    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    expect(
      await screen.findByText('プロジェクト名は必須です'),
    ).toBeInTheDocument();
    expect(updateProjectMock).not.toHaveBeenCalled();
  });

  it('名前をtrimして更新し、空白だけとtrim後101文字を拒否する', async () => {
    const user = userEvent.setup();
    updateProjectMock.mockResolvedValue(undefined);
    render(<ProjectSettingsForm {...defaultProps} />);

    const nameInput = screen.getByLabelText(/^プロジェクト名/);
    await user.clear(nameInput);
    await user.type(nameInput, '  更新後  ');
    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    await waitFor(() => {
      expect(updateProjectMock).toHaveBeenCalledWith('project-id', {
        name: '更新後',
        description: 'テスト用の説明',
      });
    });

    updateProjectMock.mockClear();
    await user.clear(nameInput);
    await user.type(nameInput, '   ');
    await user.click(screen.getByRole('button', { name: '設定を保存' }));
    expect(
      await screen.findByText('プロジェクト名は必須です'),
    ).toBeInTheDocument();
    expect(updateProjectMock).not.toHaveBeenCalled();

    await user.clear(nameInput);
    await user.type(nameInput, ` ${'a'.repeat(101)} `);
    await user.click(screen.getByRole('button', { name: '設定を保存' }));
    expect(
      await screen.findByText('プロジェクト名は100文字以内で入力してください'),
    ).toBeInTheDocument();
    expect(updateProjectMock).not.toHaveBeenCalled();
  });

  it('入力内容を更新し、成功トーストを表示して画面を再取得する', async () => {
    const user = userEvent.setup();
    updateProjectMock.mockResolvedValue(undefined);
    render(<ProjectSettingsForm {...defaultProps} />);

    await user.clear(screen.getByLabelText(/^プロジェクト名/));
    await user.type(
      screen.getByLabelText(/^プロジェクト名/),
      '更新後のプロジェクト名',
    );
    await user.clear(screen.getByLabelText('説明'));
    await user.type(screen.getByLabelText('説明'), '更新後の説明');
    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    await waitFor(() => {
      expect(updateProjectMock).toHaveBeenCalledWith('project-id', {
        name: '更新後のプロジェクト名',
        description: '更新後の説明',
      });
    });
    expect(toastMocks.add).toHaveBeenCalledWith({
      type: 'success',
      title: 'プロジェクト設定を保存しました',
    });
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it('通信に失敗した場合は日本語のエラーを表示する', async () => {
    const user = userEvent.setup();
    updateProjectMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<ProjectSettingsForm {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    expect(
      await screen.findByText(
        '通信に失敗しました。ネットワーク接続を確認して、もう一度お試しください。',
      ),
    ).toBeInTheDocument();
    expect(toastMocks.add).not.toHaveBeenCalled();
    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });

  it('APIエラーの場合はAPIのメッセージを表示する', async () => {
    const user = userEvent.setup();
    updateProjectMock.mockRejectedValue(
      new ProjectRequestError('プロジェクトが見つかりません', 404),
    );
    render(<ProjectSettingsForm {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    expect(
      await screen.findByText('プロジェクトが見つかりません'),
    ).toBeInTheDocument();
    expect(toastMocks.add).not.toHaveBeenCalled();
    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });
});
