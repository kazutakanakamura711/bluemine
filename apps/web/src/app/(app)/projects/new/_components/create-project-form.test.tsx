import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectRequestError } from '@/app/(app)/projects/_lib/api-error';
import { createProject } from '../_lib/create-project';
import { CreateProjectForm } from './create-project-form';

// vi.mock() は通常の変数定義より先に実行されるため、vi.hoisted() を使って
// テストから呼び出し回数や引数を確認できる Router のモック関数を先に用意する。
const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

// CreateProjectForm 内の useRouter() が、実際の Next.js Router ではなく
// 上で作った push・refresh のモックを返すように置き換える。
vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

// テスト中に本物の NestJS APIへ通信しないよう、作成処理をモックへ置き換える。
vi.mock('../_lib/create-project', () => {
  return {
    // 各テストで成功や409エラーなど、返す結果を自由に設定できる偽の関数。
    createProject: vi.fn(),
  };
});

const createProjectMock = vi.mocked(createProject);

async function fillRequiredFields() {
  const user = userEvent.setup();

  await user.type(
    screen.getByLabelText(/プロジェクト名/),
    'テストプロジェクト',
  );
  await user.type(screen.getByLabelText(/プロジェクトキー/), 'TEST');

  return user;
}

describe('CreateProjectForm', () => {
  beforeEach(() => {
    createProjectMock.mockReset();
    routerMocks.push.mockReset();
    routerMocks.refresh.mockReset();
  });

  it('必須項目が空の場合はエラーを表示し、プロジェクトを作成しない', async () => {
    const user = userEvent.setup();
    render(<CreateProjectForm />);

    await user.click(
      screen.getByRole('button', { name: 'プロジェクトを作成' }),
    );

    expect(
      await screen.findByText('プロジェクト名は必須です'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('プロジェクトキーは必須です'),
    ).toBeInTheDocument();
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it('前後空白を除いた名前で作成し、空白だけとtrim後101文字を拒否する', async () => {
    const user = userEvent.setup();
    createProjectMock.mockResolvedValue(undefined);
    const { unmount } = render(<CreateProjectForm />);

    await user.type(screen.getByLabelText(/プロジェクト名/), '  名前  ');
    await user.type(screen.getByLabelText(/プロジェクトキー/), 'TEST');
    await user.click(
      screen.getByRole('button', { name: 'プロジェクトを作成' }),
    );

    await waitFor(() => {
      expect(createProjectMock).toHaveBeenCalledWith({
        name: '名前',
        key: 'TEST',
        description: undefined,
      });
    });

    createProjectMock.mockClear();
    unmount();
    render(<CreateProjectForm />);
    await user.type(screen.getByLabelText(/プロジェクト名/), '   ');
    await user.type(screen.getByLabelText(/プロジェクトキー/), 'TEST');
    await user.click(
      screen.getByRole('button', { name: 'プロジェクトを作成' }),
    );
    expect(
      await screen.findByText('プロジェクト名は必須です'),
    ).toBeInTheDocument();
    expect(createProjectMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/プロジェクト名/));
    await user.type(
      screen.getByLabelText(/プロジェクト名/),
      ` ${'a'.repeat(101)} `,
    );
    await user.click(
      screen.getByRole('button', { name: 'プロジェクトを作成' }),
    );
    expect(
      await screen.findByText('プロジェクト名は100文字以内で入力してください'),
    ).toBeInTheDocument();
    expect(createProjectMock).not.toHaveBeenCalled();
  });

  it('入力内容でプロジェクトを作成し、一覧画面とサイドバーを更新する', async () => {
    createProjectMock.mockResolvedValue(undefined);
    render(<CreateProjectForm />);
    const user = await fillRequiredFields();

    await user.type(screen.getByLabelText('説明'), 'テスト用の説明');
    await user.click(
      screen.getByRole('button', { name: 'プロジェクトを作成' }),
    );

    await waitFor(() => {
      expect(createProjectMock).toHaveBeenCalledWith({
        name: 'テストプロジェクト',
        key: 'TEST',
        description: 'テスト用の説明',
      });
    });
    expect(routerMocks.push).toHaveBeenCalledWith('/projects');
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it('プロジェクトキーが重複した場合はキー入力欄にエラーを表示する', async () => {
    createProjectMock.mockRejectedValue(
      new ProjectRequestError('プロジェクトキーは既に使用されています', 409),
    );
    render(<CreateProjectForm />);
    const user = await fillRequiredFields();

    await user.click(
      screen.getByRole('button', { name: 'プロジェクトを作成' }),
    );

    expect(
      await screen.findByText('プロジェクトキーは既に使用されています'),
    ).toBeInTheDocument();
    expect(routerMocks.push).not.toHaveBeenCalled();
    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });

  it('通信に失敗した場合はフォーム上部にエラーを表示する', async () => {
    createProjectMock.mockRejectedValue(
      new Error('プロジェクトの作成に失敗しました。'),
    );
    render(<CreateProjectForm />);
    const user = await fillRequiredFields();

    await user.click(
      screen.getByRole('button', { name: 'プロジェクトを作成' }),
    );

    expect(
      await screen.findByText('プロジェクトの作成に失敗しました。'),
    ).toBeInTheDocument();
    expect(routerMocks.push).not.toHaveBeenCalled();
    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });

  it('キャンセルするとAPIを呼ばずに一覧画面へ戻る', async () => {
    const user = userEvent.setup();
    render(<CreateProjectForm />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(routerMocks.push).toHaveBeenCalledWith('/projects');
    expect(createProjectMock).not.toHaveBeenCalled();
  });
});
