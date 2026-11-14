import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PasswordRecoveryStatus } from '../_lib/recovery-password';
import { ResetPasswordForm } from './reset-password-form';

const mocks = vi.hoisted(() => ({ create: vi.fn(), submit: vi.fn() }));

vi.mock('../_lib/recovery-password', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../_lib/recovery-password')>();
  return { ...actual, createPasswordRecovery: mocks.create };
});

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(
    null,
    '',
    '/reset-password#token_hash=test-token&type=recovery',
  );
  mocks.create.mockReturnValue({ submit: mocks.submit });
  mocks.submit.mockResolvedValue({
    status: PasswordRecoveryStatus.Saved,
    signOutFailed: false,
  });
});

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText('8文字以上'), 'password123');
  await user.type(
    screen.getByPlaceholderText('パスワードを再入力'),
    'password123',
  );
  return user;
}

describe('ResetPasswordForm', () => {
  it('表示だけでは検証せず、Strict ModeでもURLから確認情報を除去して入力を受け付ける', () => {
    render(
      <StrictMode>
        <ResetPasswordForm />
      </StrictMode>,
    );

    expect(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    ).toBeEnabled();
    expect(window.location.hash).toBe('');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/名前/)).not.toBeInTheDocument();
  });

  it.each([
    '/reset-password',
    '/reset-password?token_hash=one&type=recovery',
    '/reset-password#token_hash=one&type=invite',
    '/reset-password#token_hash=one&token_hash=two&type=recovery',
    '/reset-password#token_hash=one&type=recovery&type=recovery',
  ])('不正な確認情報は送信できない: %s', (url) => {
    window.history.replaceState(null, '', url);
    render(<ResetPasswordForm />);

    expect(screen.getByRole('alert')).toHaveTextContent('再設定リンクが無効');
    expect(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    ).toBeDisabled();
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('入力が不正なら再設定処理を作らない', async () => {
    render(<ResetPasswordForm />);
    await userEvent.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );

    expect(
      await screen.findByText('パスワードは8文字以上で入力してください'),
    ).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('成功後は入力欄を閉じ、手動ログインへのリンクと別アカウントへの案内を表示する', async () => {
    render(<ResetPasswordForm />);
    const user = await fillForm();
    await user.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      'パスワードの再設定が完了しました',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '別のアカウントでログイン中の場合',
    );
    expect(
      screen.getByRole('link', { name: 'ログイン画面へ' }),
    ).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/reset-password');
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith('test-token');
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith({
      password: 'password123',
      passwordConfirm: 'password123',
    });
  });

  it.each([PasswordRecoveryStatus.Saved, PasswordRecoveryStatus.AlreadySaved])(
    '%sで一時ログアウト失敗なら、保存成功とタブを閉じる案内を表示する',
    async (status) => {
      mocks.submit.mockResolvedValue({ status, signOutFailed: true });
      render(<ResetPasswordForm />);
      const user = await fillForm();
      await user.click(
        screen.getByRole('button', { name: 'パスワードを再設定' }),
      );

      expect(await screen.findByRole('status')).toHaveTextContent(
        '再設定が完了しました',
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'このタブを閉じてからログイン画面を開いてください',
      );
      expect(
        screen.queryByRole('link', { name: 'ログイン画面へ' }),
      ).not.toBeInTheDocument();
    },
  );

  it('保存失敗からの再試行は同じ処理を使う', async () => {
    mocks.submit.mockResolvedValueOnce({
      status: PasswordRecoveryStatus.UpdateFailed,
    });
    render(<ResetPasswordForm />);
    const user = await fillForm();
    await user.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'この画面でもう一度',
    );
    await user.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );

    expect(await screen.findByRole('status')).toHaveTextContent(
      '再設定が完了しました',
    );
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.submit).toHaveBeenCalledTimes(2);
  });

  it('保存結果不明なら成功・失敗を断定せず、再試行とログインを案内する', async () => {
    mocks.submit.mockResolvedValue({
      status: PasswordRecoveryStatus.UpdateUncertain,
    });
    render(<ResetPasswordForm />);
    const user = await fillForm();
    await user.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '保存できたか確認できませんでした',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      '入力したパスワードでログイン',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    ).toBeEnabled();
  });

  it.each([
    PasswordRecoveryStatus.InvalidLink,
    PasswordRecoveryStatus.VerificationUncertain,
    PasswordRecoveryStatus.SessionExpired,
  ])('%sなら同じ画面からの再送を止める', async (status) => {
    mocks.submit.mockResolvedValue({ status });
    render(<ResetPasswordForm />);
    const user = await fillForm();
    await user.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '管理者にご連絡ください',
    );
    expect(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    ).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('処理側の入力エラーを対応する項目に表示する', async () => {
    mocks.submit.mockResolvedValue({
      status: PasswordRecoveryStatus.InvalidInput,
      field: 'passwordConfirm',
      message: '一致を確認してください',
    });
    render(<ResetPasswordForm />);
    const user = await fillForm();
    await user.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );

    expect(
      await screen.findByText('一致を確認してください'),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('パスワードを再入力')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('パスワードが拒否された場合は入力欄で修正できる', async () => {
    mocks.submit.mockResolvedValue({
      status: PasswordRecoveryStatus.PasswordRejected,
    });
    render(<ResetPasswordForm />);
    const user = await fillForm();
    await user.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );

    expect(
      await screen.findByText(/このパスワードは使用できません/),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText('8文字以上')).toBeEnabled();
  });

  it('保存中は入力と送信を無効にし、完了を待ってからログインを案内する', async () => {
    const request = Promise.withResolvers<{
      status: typeof PasswordRecoveryStatus.Saved;
      signOutFailed: boolean;
    }>();
    mocks.submit.mockReturnValueOnce(request.promise);
    render(<ResetPasswordForm />);
    const user = await fillForm();
    await user.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );

    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled();
    expect(screen.getByPlaceholderText('8文字以上')).toBeDisabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await act(async () =>
      request.resolve({
        status: PasswordRecoveryStatus.Saved,
        signOutFailed: false,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '再設定が完了しました',
    );
  });

  it('想定外の例外でも完了と断定せず、再送を止める', async () => {
    mocks.submit.mockRejectedValue(new Error('unexpected'));
    render(<ResetPasswordForm />);
    const user = await fillForm();
    await user.click(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '完了できたか確認できませんでした',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'パスワードを再設定' }),
    ).toBeDisabled();
  });
});
