import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppHeader } from './app-header';

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  createClient: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: mocks.usePathname,
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: mocks.createClient,
}));

const headerProps = {
  userName: 'テストユーザー',
  userEmail: 'user@example.com',
  projects: [
    {
      id: 'project-1',
      key: 'APP',
      name: '開発プロジェクト',
      description: null,
      isArchived: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'project-2',
      key: 'OLD',
      name: '過去のプロジェクト',
      description: null,
      isArchived: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
  ],
};

const addEventListener =
  vi.fn<
    (type: string, listener: (event: MediaQueryListEvent) => void) => void
  >();
const removeEventListener = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  mocks.usePathname.mockReturnValue('/projects');
  mocks.createClient.mockReturnValue({ auth: { signOut: mocks.signOut } });
  mocks.signOut.mockResolvedValue({ error: null });
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener:
        query === '(min-width: 64rem)' ? addEventListener : vi.fn(),
      removeEventListener:
        query === '(min-width: 64rem)' ? removeEventListener : vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AppHeader', () => {
  it('ヘッダーには操作ボタンではなく、ログインユーザーの名前を表すアイコンを表示する', () => {
    render(<AppHeader {...headerProps} />);

    expect(
      screen.getByRole('img', { name: 'ログインユーザー：テストユーザー' }),
    ).toHaveTextContent('テ');
    expect(
      screen.queryByRole('button', { name: 'ユーザーメニュー' }),
    ).not.toBeInTheDocument();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('ボタンでメニューを開き、閉じるボタンで閉じてフォーカスを戻す', async () => {
    const user = userEvent.setup();
    render(<AppHeader {...headerProps} />);
    const trigger = screen.getByRole('button', { name: 'メニューを開く' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(trigger);

    const menu = await screen.findByRole('dialog', { name: 'Bluemine' });
    expect(menu).toHaveAccessibleDescription(
      'プロジェクト画面に移動するメニューです。',
    );
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('link', { name: 'プロジェクト一覧' }),
    ).toHaveAttribute('href', '/projects');

    await user.click(screen.getByRole('button', { name: 'メニューを閉じる' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('キーボードでメニューを開き、Escape キーで閉じる', async () => {
    const user = userEvent.setup();
    render(<AppHeader {...headerProps} />);
    const trigger = screen.getByRole('button', { name: 'メニューを開く' });

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Bluemine' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('背景をクリックするとメニューを閉じる', async () => {
    const user = userEvent.setup();
    render(<AppHeader {...headerProps} />);
    await user.click(screen.getByRole('button', { name: 'メニューを開く' }));
    await screen.findByRole('dialog', { name: 'Bluemine' });

    const overlay = document.querySelector<HTMLElement>(
      '[data-slot="sheet-overlay"]',
    );
    expect(overlay).not.toBeNull();
    await user.click(overlay!);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('PC 幅に切り替わると開いていたメニューを閉じる', async () => {
    const user = userEvent.setup();
    render(<AppHeader {...headerProps} />);
    await user.click(screen.getByRole('button', { name: 'メニューを開く' }));
    await screen.findByRole('dialog', { name: 'Bluemine' });
    expect(addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    );

    act(() => {
      addEventListener.mock.calls[0][1]({
        matches: true,
      } as MediaQueryListEvent);
    });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('PC 幅に切り替わるとログアウトの小メニューも閉じ、Sheet を開き直しても残らない', async () => {
    const user = userEvent.setup();
    render(<AppHeader {...headerProps} />);
    await user.click(screen.getByRole('button', { name: 'メニューを開く' }));
    await user.click(
      await screen.findByRole('button', { name: 'ユーザーメニュー' }),
    );
    await screen.findByRole('menuitem', { name: 'ログアウト' });

    act(() => {
      addEventListener.mock.calls[0][1]({
        matches: true,
      } as MediaQueryListEvent);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('menu')).toBeNull();
    });
    await user.click(screen.getByRole('button', { name: 'メニューを開く' }));
    await screen.findByRole('dialog');
    expect(
      screen.getByRole('button', { name: 'ユーザーメニュー' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('一覧ページでは一覧リンクを選択表示し、ユーザー名とアドレスをメニューに表示する', async () => {
    const user = userEvent.setup();
    render(<AppHeader {...headerProps} />);
    await user.click(screen.getByRole('button', { name: 'メニューを開く' }));

    const listLink = await screen.findByRole('link', {
      name: 'プロジェクト一覧',
    });
    expect(listLink).toHaveAttribute('aria-current', 'page');
    expect(listLink).toHaveClass('bg-indigo-50', 'text-indigo-700');
    expect(
      screen.getByRole('link', { name: /APP\s*開発プロジェクト/ }),
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.getByRole('button', { name: 'ユーザーメニュー' }),
    ).toHaveTextContent('テストユーザー');
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
  });

  it.each(['/projects/project-1', '/projects/project-1/settings'])(
    '%s では対象プロジェクトのリンクを選択表示する',
    async (pathname) => {
      mocks.usePathname.mockReturnValue(pathname);
      const user = userEvent.setup();
      render(<AppHeader {...headerProps} />);
      await user.click(screen.getByRole('button', { name: 'メニューを開く' }));

      const projectLink = await screen.findByRole('link', {
        name: /APP\s*開発プロジェクト/,
      });
      expect(projectLink).toHaveAttribute('href', '/projects/project-1');
      expect(projectLink).toHaveAttribute('aria-current', 'page');
      expect(projectLink).toHaveClass('bg-indigo-50', 'text-indigo-700');
      expect(
        screen.getByRole('link', { name: 'プロジェクト一覧' }),
      ).not.toHaveAttribute('aria-current');
    },
  );

  it('ID の先頭部分が同じ別プロジェクトを選択表示しない', async () => {
    mocks.usePathname.mockReturnValue('/projects/project-10');
    const user = userEvent.setup();
    render(<AppHeader {...headerProps} />);
    await user.click(screen.getByRole('button', { name: 'メニューを開く' }));

    expect(
      await screen.findByRole('link', { name: /APP\s*開発プロジェクト/ }),
    ).not.toHaveAttribute('aria-current');
  });

  it('アーカイブ済みのプロジェクトも状態がわかるリンクとして表示する', async () => {
    const user = userEvent.setup();
    render(<AppHeader {...headerProps} />);
    await user.click(screen.getByRole('button', { name: 'メニューを開く' }));

    expect(
      await screen.findByRole('link', {
        name: /OLD\s*過去のプロジェクト\s*アーカイブ済み/,
      }),
    ).toHaveAttribute('href', '/projects/project-2');
  });

  it('Sheet を閉じて開き直してもログアウトの処理中状態を保ち、二重送信を防ぐ', async () => {
    let resolveSignOut!: (result: { error: { message: string } }) => void;
    mocks.signOut.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignOut = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<AppHeader {...headerProps} />);
    await user.click(screen.getByRole('button', { name: 'メニューを開く' }));
    await user.click(
      await screen.findByRole('button', { name: 'ユーザーメニュー' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'ログアウト' }),
    );
    expect(
      await screen.findByRole('menuitem', { name: 'ログアウト中…' }),
    ).toHaveAttribute('aria-disabled', 'true');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'メニューを閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'メニューを開く' }));
    await user.click(
      await screen.findByRole('button', { name: 'ユーザーメニュー' }),
    );

    const pendingItem = await screen.findByRole('menuitem', {
      name: 'ログアウト中…',
    });
    expect(pendingItem).toHaveAttribute('aria-disabled', 'true');
    await user.dblClick(pendingItem);
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.replace).not.toHaveBeenCalled();

    await act(async () =>
      resolveSignOut({ error: { message: 'Network error' } }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ログアウトできませんでした。時間をおいて再度お試しください。',
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
