import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/lib/auth/get-current-user';
import { LoginForm } from './login-form';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signInWithPassword: vi.fn(),
  getCurrentUser: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

const successfulLoginResult = {
  data: { session: { access_token: 'test-access-token' } },
  error: null,
};

const currentUser: CurrentUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'user@example.com',
  name: null,
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: mocks.createClient,
}));

// 本人取得の成功・失敗を再現し、テスト中は実際の API に通信しない。
vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

async function fillCredentials(password = '123456') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/メールアドレス/), 'user@example.com');
  await user.type(
    screen.getByLabelText(/パスワード/, { selector: 'input' }),
    password,
  );
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockReturnValue({
    auth: { signInWithPassword: mocks.signInWithPassword },
  });
  mocks.signInWithPassword.mockResolvedValue(successfulLoginResult);
  mocks.getCurrentUser.mockResolvedValue(currentUser);
});

describe('LoginForm', () => {
  it('クリックと Enter キーでパスワードの表示を切り替え、入力値を保って送信しない', async () => {
    render(<LoginForm />);
    const user = await fillCredentials('p@ss word123');
    const passwordInput = screen.getByLabelText(/パスワード/, {
      selector: 'input',
    });
    expect(passwordInput).toHaveAttribute('type', 'password');

    await user.click(
      screen.getByRole('button', { name: 'パスワードを表示する' }),
    );

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(passwordInput).toHaveValue('p@ss word123');
    expect(
      screen.getByRole('button', { name: 'パスワードを非表示にする' }),
    ).toHaveTextContent('非表示');

    await user.keyboard('{Enter}');

    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveValue('p@ss word123');
    expect(
      screen.getByRole('button', { name: 'パスワードを表示する' }),
    ).toHaveTextContent('表示');
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it('未入力の項目はエラーを表示し、Supabase を呼ばない', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(
      await screen.findByText('メールアドレスを入力してください'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('パスワードを入力してください'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/メールアドレス/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      screen.getByLabelText(/パスワード/, { selector: 'input' }),
    ).toHaveAccessibleDescription('パスワードを入力してください');
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it('メール形式が不正な場合は認証リクエストを送らない', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/メールアドレス/), 'invalid');
    await user.type(
      screen.getByLabelText(/パスワード/, { selector: 'input' }),
      '123456',
    );

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(
      await screen.findByText('有効なメールアドレスを入力してください'),
    ).toBeInTheDocument();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });

  it.each(['123456', '  password  '])(
    'パスワード「%s」を変更せずに照合し、成功時は一覧へ遷移して更新する',
    async (password) => {
      render(<LoginForm />);
      const user = await fillCredentials(password);
      await user.clear(screen.getByLabelText(/メールアドレス/));
      await user.type(
        screen.getByLabelText(/メールアドレス/),
        '  user@example.com  ',
      );

      await user.click(screen.getByRole('button', { name: 'ログイン' }));

      await waitFor(() => {
        expect(mocks.signInWithPassword).toHaveBeenCalledWith({
          email: 'user@example.com',
          password,
        });
        expect(mocks.replace).toHaveBeenCalledWith('/projects');
      });
      expect(mocks.getCurrentUser).toHaveBeenCalledOnce();
      expect(mocks.getCurrentUser).toHaveBeenCalledWith('test-access-token');
      expect(mocks.refresh).toHaveBeenCalledOnce();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('本人情報の取得が完了するまで送信中の状態を保ち、取得後に一覧へ遷移する', async () => {
    let resolveCurrentUser!: (user: CurrentUser) => void;
    const pendingCurrentUser = new Promise<CurrentUser>((resolve) => {
      resolveCurrentUser = resolve;
    });
    mocks.getCurrentUser.mockReturnValueOnce(pendingCurrentUser);
    render(<LoginForm />);
    const user = await fillCredentials();

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(mocks.getCurrentUser).toHaveBeenCalledWith('test-access-token');
    });
    const submitButton = screen.getByRole('button', { name: 'ログイン中…' });
    expect(submitButton).toBeDisabled();
    expect(screen.getByLabelText(/メールアドレス/)).toBeDisabled();
    expect(
      screen.getByLabelText(/パスワード/, { selector: 'input' }),
    ).toBeDisabled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();

    await user.click(submitButton);
    expect(mocks.signInWithPassword).toHaveBeenCalledOnce();
    expect(mocks.getCurrentUser).toHaveBeenCalledOnce();

    await act(async () => resolveCurrentUser(currentUser));

    expect(mocks.replace).toHaveBeenCalledWith('/projects');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('本人情報の取得失敗時はエラーを表示して遷移を止め、再試行の成功後に遷移する', async () => {
    mocks.getCurrentUser
      .mockRejectedValueOnce(new Error('ユーザー情報の取得に失敗しました。'))
      .mockResolvedValueOnce(currentUser);
    render(<LoginForm />);
    const user = await fillCredentials();

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ログインできませんでした。時間をおいて再度お試しください。',
    );
    expect(mocks.getCurrentUser).toHaveBeenCalledWith('test-access-token');
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/projects');
    });
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    {
      code: 'invalid_credentials',
      message: 'メールアドレスまたはパスワードが正しくありません。',
    },
    {
      code: 'email_not_confirmed',
      message:
        'メールアドレスの確認が完了していません。確認メールのリンクを開いてください。',
    },
    {
      code: 'over_request_rate_limit',
      message:
        'ログインの試行回数が多すぎます。時間をおいて再度お試しください。',
    },
  ])('認証失敗「$code」はフォーム全体に表示し、遷移しない', async (error) => {
    mocks.signInWithPassword.mockResolvedValue({
      error: { code: error.code, message: 'Raw Supabase error' },
    });
    render(<LoginForm />);
    const user = await fillCredentials();

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(error.message);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('通信失敗が返る場合も例外になる場合も、再試行できるエラーを表示する', async () => {
    mocks.signInWithPassword
      .mockResolvedValueOnce({
        error: { message: 'Failed to fetch', status: 0 },
      })
      .mockRejectedValueOnce(new Error('Network unavailable'));
    render(<LoginForm />);
    const user = await fillCredentials();

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ログインできませんでした。時間をおいて再度お試しください。',
    );
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledTimes(2);
      expect(screen.getByRole('button', { name: 'ログイン' })).toBeEnabled();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'ログインできませんでした。時間をおいて再度お試しください。',
    );
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('接続設定が不足していても例外を画面に漏らさず、遷移しない', async () => {
    mocks.createClient.mockImplementation(() => {
      throw new Error('Missing Supabase configuration');
    });
    render(<LoginForm />);
    const user = await fillCredentials();

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ログインできませんでした。時間をおいて再度お試しください。',
    );
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('ログインの返り値にセッションがない場合はエラーを表示し、遷移しない', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    render(<LoginForm />);
    const user = await fillCredentials();

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ログインできませんでした。時間をおいて再度お試しください。',
    );
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('再送信時は前回のエラーを消し、処理中は編集と二重送信を防ぐ', async () => {
    let resolveLogin!: (result: typeof successfulLoginResult) => void;
    const pendingLogin = new Promise<typeof successfulLoginResult>(
      (resolve) => {
        resolveLogin = resolve;
      },
    );
    mocks.signInWithPassword
      .mockResolvedValueOnce({ error: { code: 'invalid_credentials' } })
      .mockReturnValueOnce(pendingLogin);
    render(<LoginForm />);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'ログイン' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    const submitButton = await screen.findByRole('button', {
      name: 'ログイン中…',
    });
    expect(submitButton).toBeDisabled();
    expect(screen.getByLabelText(/メールアドレス/)).toBeDisabled();
    expect(
      screen.getByLabelText(/パスワード/, { selector: 'input' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'パスワードを表示する' }),
    ).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(submitButton);
    expect(mocks.signInWithPassword).toHaveBeenCalledTimes(2);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();

    await act(async () => resolveLogin(successfulLoginResult));

    expect(mocks.getCurrentUser).toHaveBeenCalledWith('test-access-token');
    expect(mocks.replace).toHaveBeenCalledWith('/projects');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
