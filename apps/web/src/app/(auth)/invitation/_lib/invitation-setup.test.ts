import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInvitationSetup } from './invitation-setup';

const mocks = vi.hoisted(() => ({
  createInvitationClient: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./invitation-client', () => ({
  createInvitationClient: mocks.createInvitationClient,
}));

const user = { id: 'invited-user' };
const values = {
  name: '  招待ユーザー  ',
  password: ' password123 ',
  passwordConfirm: ' password123 ',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createInvitationClient.mockReturnValue({
    auth: {
      verifyOtp: mocks.verifyOtp,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  });
  mocks.verifyOtp.mockResolvedValue({
    data: { user, session: { access_token: 'test-token', user } },
    error: null,
  });
  mocks.updateUser.mockResolvedValue({ data: { user }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe('招待されたユーザーの初期設定', () => {
  it.each([
    { input: { ...values, name: '  ' }, field: 'name' },
    { input: { ...values, password: '1234567' }, field: 'password' },
    {
      input: { ...values, passwordConfirm: 'different' },
      field: 'passwordConfirm',
    },
  ])(
    '入力不正は招待リンクを使う前に拒否する: $field',
    async ({ input, field }) => {
      const setup = createInvitationSetup('invitation-token');

      await expect(setup.submit(input)).resolves.toEqual({
        status: 'invalid_input',
        field,
      });
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
      expect(mocks.updateUser).not.toHaveBeenCalled();
    },
  );

  it('招待された本人を検証し、名前とパスワードを保存して一時セッションだけ終了する', async () => {
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'success',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledExactlyOnceWith({
      token_hash: 'invitation-token',
      type: 'invite',
    });
    expect(mocks.updateUser).toHaveBeenCalledExactlyOnceWith({
      password: values.password,
      data: { name: '招待ユーザー' },
    });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    await expect(setup.submit(values)).resolves.toEqual({
      status: 'already_completed',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledOnce();
  });

  it('保存が拒否されたら、リンクを再検証せず同じクライアントで再試行する', async () => {
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('weak password', 422, 'weak_password'),
    });
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'password_rejected',
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
    await expect(setup.submit(values)).resolves.toEqual({
      status: 'success',
      signOutFailed: false,
    });
    expect(mocks.createInvitationClient).toHaveBeenCalledOnce();
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledTimes(2);
  });

  it('期限切れや使用済みの招待リンクなら保存しない', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('expired', 403, 'otp_expired'),
    });
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'invalid_invitation',
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('招待検証の通信結果が不明なときは、リンクを自動で再使用しない', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError('network failure', 0),
    });
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'verification_uncertain',
    });
    await expect(setup.submit(values)).resolves.toEqual({
      status: 'verification_uncertain',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('招待検証が例外で中断しても、使用済みの可能性があるリンクを自動で再使用しない', async () => {
    mocks.verifyOtp.mockRejectedValue(new TypeError('network failure'));
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'verification_uncertain',
    });
    await expect(setup.submit(values)).resolves.toEqual({
      status: 'verification_uncertain',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('検証された本人とセッションの本人が一致しなければ保存しない', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: {
        user,
        session: { access_token: 'test-token', user: { id: 'other-user' } },
      },
      error: null,
    });
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'verification_uncertain',
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('保存の通信結果が不明なら成功と断定せず、同じセッションで再試行できる', async () => {
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthRetryableFetchError('network failure', 0),
    });
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'update_uncertain',
    });
    await expect(setup.submit(values)).resolves.toEqual({
      status: 'success',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });

  it('保存後の本人を確認できなければ成功と断定しない', async () => {
    mocks.updateUser.mockResolvedValue({
      data: { user: { id: 'other-user' } },
      error: null,
    });
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'update_uncertain',
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it.each(['same_password', 'weak_password', 'validation_failed'])(
    '保存結果が不明な後の再送が %s で拒否されても、未保存と断定しない',
    async (code) => {
      mocks.updateUser
        .mockResolvedValueOnce({
          data: { user: null },
          error: new AuthRetryableFetchError('response lost', 0),
        })
        .mockResolvedValueOnce({
          data: { user: null },
          error: new AuthApiError('retry rejected', 422, code),
        });
      const setup = createInvitationSetup('invitation-token');

      await expect(setup.submit(values)).resolves.toEqual({
        status: 'update_uncertain',
      });
      await expect(setup.submit(values)).resolves.toEqual({
        status: 'update_uncertain',
      });
      expect(mocks.verifyOtp).toHaveBeenCalledOnce();
      expect(mocks.signOut).not.toHaveBeenCalled();
      // 保存成功の応答を確認できれば、完了に進める。
      await expect(setup.submit(values)).resolves.toEqual({
        status: 'success',
        signOutFailed: false,
      });
    },
  );

  it('保存中の例外後も、再送の拒否によって未保存と断定しない', async () => {
    mocks.updateUser
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValueOnce({
        data: { user: null },
        error: new AuthApiError('same password', 422, 'same_password'),
      });
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'update_uncertain',
    });
    await expect(setup.submit(values)).resolves.toEqual({
      status: 'update_uncertain',
    });
  });

  it('以前の保存結果が不明ではない場合は、確実な保存拒否と区別する', async () => {
    mocks.updateUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('invalid request', 422, 'validation_failed'),
    });
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'update_failed',
    });
  });

  it('一時セッションが失われたら復旧が必要な結果を返す', async () => {
    mocks.updateUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'session_expired',
    });
    await expect(setup.submit(values)).resolves.toEqual({
      status: 'session_expired',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledOnce();
  });

  it('一時ログアウトが失敗しても保存成功と失効通知の失敗を区別する', async () => {
    mocks.signOut.mockResolvedValue({
      error: new AuthRetryableFetchError('network failure', 0),
    });
    const setup = createInvitationSetup('invitation-token');

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'success',
      signOutFailed: true,
    });
    await expect(setup.submit(values)).resolves.toEqual({
      status: 'already_completed',
    });
    expect(mocks.updateUser).toHaveBeenCalledOnce();
  });

  it('送信中の重複操作ではリンクを二重に検証しない', async () => {
    let resolveVerification!: (value: unknown) => void;
    mocks.verifyOtp.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveVerification = resolve;
      }),
    );
    const setup = createInvitationSetup('invitation-token');
    const first = setup.submit(values);

    await expect(setup.submit(values)).resolves.toEqual({
      status: 'in_progress',
    });
    resolveVerification({
      data: { user, session: { access_token: 'test-token', user } },
      error: null,
    });
    await expect(first).resolves.toEqual({
      status: 'success',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });
});
