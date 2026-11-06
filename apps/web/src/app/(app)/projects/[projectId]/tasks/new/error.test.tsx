import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import NewTaskError from './error';

vi.mock('next/navigation', () => ({
  useParams: () => ({ projectId: 'project/1?x=y' }),
}));

it('作成画面の取得失敗を伝え、対象Projectのタスク一覧へ戻れる', () => {
  render(<NewTaskError retry={vi.fn()} />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'タスク作成画面を読み込めませんでした',
  );
  expect(
    screen.getByRole('link', { name: 'タスク一覧に戻る' }),
  ).toHaveAttribute('href', '/projects/project%2F1%3Fx%3Dy/tasks');
});

it('再試行を押すとルートの再取得を呼ぶ', async () => {
  const user = userEvent.setup();
  const retry = vi.fn();
  render(<NewTaskError retry={retry} />);
  await user.click(screen.getByRole('button', { name: '再試行' }));
  expect(retry).toHaveBeenCalledOnce();
});
