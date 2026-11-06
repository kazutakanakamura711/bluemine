import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ProjectTasksError from './error';

describe('ProjectTasksError', () => {
  it('取得失敗の案内とプロジェクト一覧へ戻るリンクを表示する', () => {
    render(<ProjectTasksError retry={vi.fn()} />);

    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('heading', {
        name: 'タスク一覧を取得できませんでした',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent('時間をおいて、もう一度お試しください。');
    expect(
      screen.getByRole('link', { name: 'プロジェクト一覧に戻る' }),
    ).toHaveAttribute('href', '/projects');
  });

  it('再試行ボタンを押すとNext.jsから渡されたretryを呼ぶ', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<ProjectTasksError retry={retry} />);

    expect(retry).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '再試行' }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
