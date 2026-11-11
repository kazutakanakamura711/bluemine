import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InvitationSetupStatus } from '../_lib/invitation-setup';
import { InvitationForm } from './invitation-form';

const mocks = vi.hoisted(() => ({ create: vi.fn(), submit: vi.fn() }));

vi.mock('../_lib/invitation-setup', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../_lib/invitation-setup')>();
  return { ...actual, createInvitationSetup: mocks.create };
});

async function fillForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/名前/), '招待 太郎');
  await user.type(screen.getByPlaceholderText('8文字以上'), 'password123');
  await user.type(
    screen.getByPlaceholderText('パスワードを再入力'),
    'password123',
  );
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(
    null,
    '',
    '/invitation#token_hash=test-token&type=invite',
  );
  mocks.create.mockReturnValue({ submit: mocks.submit });
  mocks.submit.mockResolvedValue({
    status: InvitationSetupStatus.Success,
    signOutFailed: false,
  });
});

describe('InvitationForm', () => {
  it('画面を開いた時点では招待を検証せず、URLから招待情報を除く', async () => {
    render(<InvitationForm />);

    expect(
      await screen.findByRole('button', { name: '初期設定を完了' }),
    ).toBeEnabled();
    expect(window.location.hash).toBe('');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      screen.getByText(/再読み込みやタブを閉じないでください/),
    ).toBeInTheDocument();
  });

  it('入力が不正なら招待を検証しない', async () => {
    render(<InvitationForm />);
    await userEvent.click(
      screen.getByRole('button', { name: '初期設定を完了' }),
    );

    expect(
      await screen.findByText('名前を入力してください'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('パスワードは8文字以上で入力してください'),
    ).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it.each([
    '/invitation#token_hash=one&token_hash=two&type=invite',
    '/invitation#token_hash=one&type=invite&type=invite',
    '/invitation#token_hash=one&type=recovery',
    '/invitation?token_hash=one&type=invite',
    '/invitation',
  ])('招待情報が不正な %s は送信できない', async (url) => {
    window.history.replaceState(null, '', url);
    render(<InvitationForm />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '招待リンクが無効',
    );
    expect(
      screen.getByRole('button', { name: '初期設定を完了' }),
    ).toBeDisabled();
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('保存失敗後は同じ処理を使って再試行し、成功後にログインを案内する', async () => {
    mocks.submit
      .mockResolvedValueOnce({ status: InvitationSetupStatus.UpdateFailed })
      .mockResolvedValueOnce({
        status: InvitationSetupStatus.Success,
        signOutFailed: false,
      });
    render(<InvitationForm />);
    const user = await fillForm();

    await user.click(screen.getByRole('button', { name: '初期設定を完了' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'この画面でもう一度',
    );
    await user.click(screen.getByRole('button', { name: '初期設定を完了' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      '初期設定が完了しました',
    );
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith('test-token');
    expect(mocks.submit).toHaveBeenCalledTimes(2);
    expect(mocks.submit).toHaveBeenCalledWith({
      name: '招待 太郎',
      password: 'password123',
      passwordConfirm: 'password123',
    });
    expect(
      screen.getByRole('link', { name: 'ログイン画面へ' }),
    ).toHaveAttribute('href', '/login');
  });

  it('検証結果が不明な場合は再送を止め、管理者への連絡を案内する', async () => {
    mocks.submit.mockResolvedValue({
      status: InvitationSetupStatus.VerificationUncertain,
    });
    render(<InvitationForm />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: '初期設定を完了' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '管理者にご連絡ください',
    );
    expect(
      screen.getByRole('button', { name: '初期設定を完了' }),
    ).toBeDisabled();
    expect(mocks.submit).toHaveBeenCalledOnce();
  });

  it('保存結果が不明なら断定せず、同じ画面での再試行を案内する', async () => {
    mocks.submit.mockResolvedValue({
      status: InvitationSetupStatus.UpdateUncertain,
    });
    render(<InvitationForm />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: '初期設定を完了' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '保存できたか確認できませんでした',
    );
    expect(
      screen.getByRole('button', { name: '初期設定を完了' }),
    ).toBeEnabled();
  });

  it('送信中は入力と二重送信を防ぐ', async () => {
    let resolveSubmit!: (value: {
      status: typeof InvitationSetupStatus.Success;
      signOutFailed: boolean;
    }) => void;
    mocks.submit.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    render(<InvitationForm />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: '初期設定を完了' }));

    expect(
      await screen.findByRole('button', { name: '設定中…' }),
    ).toBeDisabled();
    expect(screen.getByLabelText(/名前/)).toBeDisabled();
    expect(mocks.submit).toHaveBeenCalledOnce();
    await act(async () =>
      resolveSubmit({
        status: InvitationSetupStatus.Success,
        signOutFailed: false,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '初期設定が完了しました',
      ),
    );
  });

  it('設定成功後の一時セッション破棄に失敗したらタブを閉じるよう案内する', async () => {
    mocks.submit.mockResolvedValue({
      status: InvitationSetupStatus.Success,
      signOutFailed: true,
    });
    render(<InvitationForm />);
    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: '初期設定を完了' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'このタブを閉じてからログイン画面を開いてください',
    );
    expect(
      screen.queryByRole('link', { name: 'ログイン画面へ' }),
    ).not.toBeInTheDocument();
  });
});
