import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ProjectMembersError from './error';

describe('ProjectMembersError', () => {
  it('取得失敗の案内とプロジェクト一覧へ戻るリンクを表示する', () => {
    render(<ProjectMembersError retry={vi.fn()} />);

    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('heading', {
        name: 'メンバー情報を取得できませんでした',
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
    render(<ProjectMembersError retry={retry} />);

    expect(retry).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '再試行' }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
