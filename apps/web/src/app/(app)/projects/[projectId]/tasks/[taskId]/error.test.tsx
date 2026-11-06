import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TaskDetailError from './error';

const mocks = vi.hoisted(() => ({ useParams: vi.fn() }));

vi.mock('next/navigation', () => ({ useParams: mocks.useParams }));

describe('TaskDetailError', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({
      projectId: 'project-1',
      taskId: 'task-1',
    });
  });

  it('詳細の取得失敗を伝え、URLのProjectのタスク一覧に戻れる', () => {
    render(<TaskDetailError retry={vi.fn()} />);

    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('heading', {
        name: 'タスク詳細を取得できませんでした',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent('時間をおいて、もう一度お試しください。');
    expect(
      screen.getByRole('link', { name: 'タスク一覧に戻る' }),
    ).toHaveAttribute('href', '/projects/project-1/tasks');
  });

  it('再試行を押すとNext.jsから渡されたretryを呼ぶ', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    render(<TaskDetailError retry={retry} />);

    expect(retry).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('Project IDをURLの1区間としてエンコードし、Task IDは戻り先に含めない', () => {
    mocks.useParams.mockReturnValue({
      projectId: 'project/1?x=y',
      taskId: 'task-1',
    });
    render(<TaskDetailError retry={vi.fn()} />);

    expect(
      screen.getByRole('link', { name: 'タスク一覧に戻る' }),
    ).toHaveAttribute('href', '/projects/project%2F1%3Fx%3Dy/tasks');
  });
});
