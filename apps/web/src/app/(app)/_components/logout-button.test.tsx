import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserMenu } from './user-menu';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: mocks.createClient,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

const successfulSignOutResult = { error: null };
const logoutErrorMessage =
  'ログアウトできませんでした。時間をおいて再度お試しください。';

async function openMenu() {
  const user = userEvent.setup();
  render(<UserMenu userName="テストユーザー" userEmail="user@example.com" />);
  await user.click(screen.getByRole('button', { name: 'ユーザーメニュー' }));
  await screen.findByRole('menuitem', { name: 'ログアウト' });
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockReturnValue({ auth: { signOut: mocks.signOut } });
  mocks.signOut.mockResolvedValue(successfulSignOutResult);
});

describe('LogoutButton', () => {
  it('ログアウト項目を押したときだけ現在のセッションを終了し、ログイン画面へ遷移して更新する', async () => {
    const user = await openMenu();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();

    await user.click(screen.getByRole('menuitem', { name: 'ログアウト' }));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/login');
    });
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('キーボードでメニューを開き、Enter キーでログアウトできる', async () => {
    const user = userEvent.setup();
    render(<UserMenu userName="テストユーザー" userEmail="user@example.com" />);

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'ユーザーメニュー' }),
    ).toHaveFocus();
    await user.keyboard('{ArrowDown}');

    const logoutItem = await screen.findByRole('menuitem', {
      name: 'ログアウト',
    });
    await waitFor(() => expect(logoutItem).toHaveFocus());
    await user.keyboard('{Enter}');

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login'));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('処理中にメニューを開き直しても状態を保ち、二重送信と完了前の遷移を防ぐ', async () => {
    let resolveSignOut!: (result: typeof successfulSignOutResult) => void;
    mocks.signOut.mockReturnValueOnce(
      new Promise<typeof successfulSignOutResult>((resolve) => {
        resolveSignOut = resolve;
      }),
    );
    const user = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: 'ログアウト' }));

    const pendingItem = await screen.findByRole('menuitem', {
      name: 'ログアウト中…',
    });
    expect(pendingItem).toHaveAttribute('aria-disabled', 'true');
    expect(pendingItem).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'ユーザーメニュー' }));

    const reopenedPendingItem = await screen.findByRole('menuitem', {
      name: 'ログアウト中…',
    });
    expect(reopenedPendingItem).toHaveAttribute('aria-disabled', 'true');
    await user.dblClick(reopenedPendingItem);
    expect(mocks.signOut).toHaveBeenCalledOnce();

    await act(async () => resolveSignOut(successfulSignOutResult));

    expect(mocks.replace).toHaveBeenCalledWith('/login');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('SDK がエラーを返すと遷移せず、メニューを閉じても案内が残る', async () => {
    mocks.signOut.mockResolvedValueOnce({
      error: { message: 'Raw Supabase error' },
    });
    const user = await openMenu();

    await user.click(screen.getByRole('menuitem', { name: 'ログアウト' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      logoutErrorMessage,
    );
    expect(
      screen.getByRole('menuitem', { name: 'ログアウト' }),
    ).not.toHaveAttribute('aria-disabled', 'true');
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(logoutErrorMessage);
  });

  it.each(['通信の例外', 'クライアント作成の例外'])(
    '%sでも案内を表示して遷移せず、再試行できる',
    async (failure) => {
      if (failure === '通信の例外') {
        mocks.signOut.mockRejectedValueOnce(new Error('Network unavailable'));
      } else {
        mocks.createClient.mockImplementationOnce(() => {
          throw new Error('Missing Supabase configuration');
        });
      }
      const user = await openMenu();

      await user.click(screen.getByRole('menuitem', { name: 'ログアウト' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        logoutErrorMessage,
      );
      expect(
        screen.getByRole('menuitem', { name: 'ログアウト' }),
      ).not.toHaveAttribute('aria-disabled', 'true');
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    },
  );

  it('再試行時に前回のエラーを消し、成功すればログイン画面へ遷移する', async () => {
    let resolveSignOut!: (result: typeof successfulSignOutResult) => void;
    mocks.signOut
      .mockResolvedValueOnce({ error: { message: 'Failed to fetch' } })
      .mockReturnValueOnce(
        new Promise<typeof successfulSignOutResult>((resolve) => {
          resolveSignOut = resolve;
        }),
      );
    const user = await openMenu();
    await user.click(screen.getByRole('menuitem', { name: 'ログアウト' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      logoutErrorMessage,
    );

    await user.click(screen.getByRole('menuitem', { name: 'ログアウト' }));

    expect(
      await screen.findByRole('menuitem', { name: 'ログアウト中…' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () => resolveSignOut(successfulSignOutResult));

    expect(mocks.replace).toHaveBeenCalledOnce();
    expect(mocks.replace).toHaveBeenCalledWith('/login');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
