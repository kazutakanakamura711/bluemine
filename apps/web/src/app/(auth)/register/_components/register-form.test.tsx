import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegisterForm } from './register-form';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signUp: vi.fn(),
}));

const successfulRegistrationResult = {
  data: {
    user: { id: 'test-user-id' },
    session: { access_token: 'test-access-token' },
  },
  error: null,
};

const genericError = '登録に失敗しました。時間をおいて再度お試しください。';

vi.mock('@/lib/supabase/client', () => ({
  createClient: mocks.createClient,
}));

async function fillForm({
  name = '登録テスト',
  email = 'new-user@example.com',
  password = 'password123',
  passwordConfirm = password,
}: {
  name?: string;
  email?: string;
  password?: string;
  passwordConfirm?: string;
} = {}) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/名前/), name);
  await user.type(screen.getByLabelText(/メールアドレス/), email);
  await user.type(screen.getByPlaceholderText('8文字以上'), password);
  await user.type(
    screen.getByPlaceholderText('パスワードを再入力'),
    passwordConfirm,
  );
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createClient.mockReturnValue({ auth: { signUp: mocks.signUp } });
  mocks.signUp.mockResolvedValue(successfulRegistrationResult);
});

describe('RegisterForm', () => {
  it('未入力の項目にエラーを表示し、Supabase を呼ばない', async () => {
    render(<RegisterForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

    expect(
      await screen.findByText('名前を入力してください'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('メールアドレスを入力してください'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('パスワードは8文字以上で入力してください'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('パスワード（確認）を入力してください'),
    ).toBeInTheDocument();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('メール形式が不正な場合は登録リクエストを送らない', async () => {
    render(<RegisterForm />);
    const user = await fillForm({ email: 'invalid' });

    await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

    expect(
      await screen.findByText('有効なメールアドレスを入力してください'),
    ).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('8文字未満のパスワードは登録リクエストを送らない', async () => {
    render(<RegisterForm />);
    const user = await fillForm({ password: '1234567' });

    await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

    expect(
      await screen.findByText('パスワードは8文字以上で入力してください'),
    ).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('パスワードの不一致を確認欄に表示し、登録リクエストを送らない', async () => {
    render(<RegisterForm />);
    const user = await fillForm({ passwordConfirm: 'different-password' });

    await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

    const message = 'パスワードとパスワード（確認）が一致しません';
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('パスワードを再入力')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      screen.getByPlaceholderText('パスワードを再入力'),
    ).toHaveAccessibleDescription(message);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it('名前とメールを trim し、パスワードを変更せず確認用パスワードを除いて送信する', async () => {
    render(<RegisterForm />);
    const password = '  password123  ';
    const user = await fillForm({
      name: '  登録テスト  ',
      email: '  new-user@example.com  ',
      password,
    });

    await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'アカウントを作成しました。',
    );
    expect(mocks.signUp).toHaveBeenCalledOnce();
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: 'new-user@example.com',
      password,
      options: { data: { name: '登録テスト' } },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('登録時にセッションが返らない場合はメール確認の案内を表示する', async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: 'test-user-id' }, session: null },
      error: null,
    });
    render(<RegisterForm />);
    const user = await fillForm();

    await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '登録を受け付けました。確認メールのリンクを開くと、メール確認が完了し、自動的にアプリへ進みます。',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [
      'user_already_exists',
      'このメールアドレスはすでに登録されています。ログインをお試しください。',
    ],
    [
      'weak_password',
      'パスワードの条件を満たしていません。別のパスワードをお試しください。',
    ],
    [
      'over_email_send_rate_limit',
      '確認メールの送信回数が多すぎます。時間をおいて再度お試しください。',
    ],
  ])('Supabase の %s を日本語で表示する', async (code, message) => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code },
    });
    render(<RegisterForm />);
    const user = await fillForm();

    await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['returned', 'thrown'])(
    '通信エラー（%s）は汎用メッセージで表示する',
    async (mode) => {
      if (mode === 'returned') {
        mocks.signUp.mockResolvedValue({
          data: { user: null, session: null },
          error: { code: 'unexpected_failure' },
        });
      } else {
        mocks.signUp.mockRejectedValue(new TypeError('Failed to fetch'));
      }
      render(<RegisterForm />);
      const user = await fillForm();

      await user.click(
        screen.getByRole('button', { name: 'アカウントを作成' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(genericError);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'アカウントを作成' }),
      ).toBeEnabled();
    },
  );

  it('登録結果にユーザーがない場合は成功として扱わない', async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });
    render(<RegisterForm />);
    const user = await fillForm();

    await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(genericError);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('再送信で前回のエラーを消し、処理中は入力と二重送信を無効化する', async () => {
    mocks.signUp.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<RegisterForm />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(genericError);

    let resolveSignUp!: (result: typeof successfulRegistrationResult) => void;
    mocks.signUp.mockReturnValueOnce(
      new Promise<typeof successfulRegistrationResult>((resolve) => {
        resolveSignUp = resolve;
      }),
    );
    await user.click(screen.getByRole('button', { name: 'アカウントを作成' }));

    const submitButton = screen.getByRole('button', {
      name: 'アカウント作成中…',
    });
    expect(submitButton).toBeDisabled();
    expect(screen.getByLabelText(/名前/)).toBeDisabled();
    expect(screen.getByLabelText(/メールアドレス/)).toBeDisabled();
    expect(screen.getByPlaceholderText('8文字以上')).toBeDisabled();
    expect(screen.getByPlaceholderText('パスワードを再入力')).toBeDisabled();
    expect(screen.getByRole('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(submitButton);
    expect(mocks.signUp).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveSignUp(successfulRegistrationResult);
    });

    expect(await screen.findByRole('status')).toHaveTextContent(
      'アカウントを作成しました。',
    );
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'アカウントを作成' }),
      ).toBeEnabled();
    });
  });
});
