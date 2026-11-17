import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForgotPasswordForm } from './forgot-password-form';

const mocks = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }));

vi.mock('../../reset-password/_lib/recovery-client', () => ({
  createRecoveryClient: () => ({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
});

describe('ForgotPasswordForm', () => {
  it('形式が不正なメールでは送信しない', async () => {
    render(<ForgotPasswordForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/メールアドレス/), 'invalid');
    await user.click(
      screen.getByRole('button', { name: '再設定メールを送信' }),
    );
    expect(
      await screen.findByText('有効なメールアドレスを入力してください'),
    ).toBeInTheDocument();
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('メールアドレスを整えてSupabaseに依頼し、一律の案内を表示する', async () => {
    render(<ForgotPasswordForm />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/メールアドレス/),
      ' user@example.com ',
    );
    await user.click(
      screen.getByRole('button', { name: '再設定メールを送信' }),
    );
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
      'user@example.com',
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'アカウントがある場合',
    );
  });

  it('通信結果が不明なときは成功を断定せず再試行できる', async () => {
    mocks.resetPasswordForEmail.mockRejectedValueOnce(new Error('network'));
    render(<ForgotPasswordForm />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/メールアドレス/),
      'user@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: '再設定メールを送信' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '送信できたか確認できませんでした',
    );
    await user.click(
      screen.getByRole('button', { name: '再設定メールを送信' }),
    );
    expect(await screen.findByRole('status')).toBeInTheDocument();
  });

  it('Supabaseがエラーを返した場合も完了と表示しない', async () => {
    mocks.resetPasswordForEmail.mockResolvedValueOnce({
      error: { code: 'over_email_send_rate_limit' },
    });
    render(<ForgotPasswordForm />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/メールアドレス/),
      'user@example.com',
    );
    await user.click(
      screen.getByRole('button', { name: '再設定メールを送信' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '送信できたか確認できませんでした',
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
