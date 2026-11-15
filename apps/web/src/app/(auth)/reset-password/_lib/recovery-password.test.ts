import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPasswordRecovery } from './recovery-password';

const mocks = vi.hoisted(() => ({
  createRecoveryClient: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('./recovery-client', () => ({
  createRecoveryClient: mocks.createRecoveryClient,
}));

const user = { id: 'recovery-user' };
const verificationResponse = {
  data: { user, session: { access_token: 'test-token', user } },
  error: null,
};
const values = {
  password: ' password123 ',
  passwordConfirm: ' password123 ',
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createRecoveryClient.mockReturnValue({
    auth: {
      verifyOtp: mocks.verifyOtp,
      getSession: mocks.getSession,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  });
  mocks.verifyOtp.mockResolvedValue(verificationResponse);
  mocks.getSession.mockResolvedValue({
    data: { session: verificationResponse.data.session },
    error: null,
  });
  mocks.updateUser.mockResolvedValue({ data: { user }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe('検証した本人のパスワード保存', () => {
  it('同じクライアントでパスワードだけを保存し、名前や確認用パスワードを送らない', async () => {
    const recovery = createPasswordRecovery('recovery-token');
    const input = { ...values, name: '更新しない名前' };

    await expect(recovery.submit(input)).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    expect(mocks.createRecoveryClient).toHaveBeenCalledOnce();
    expect(mocks.verifyOtp).toHaveBeenCalledExactlyOnceWith({
      token_hash: 'recovery-token',
      type: 'recovery',
    });
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledExactlyOnceWith({
      password: values.password,
    });
    expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'already_saved',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledOnce();
  });

  it('入力に問題があれば、リンク検証と保存の両方を行わない', async () => {
    const recovery = createPasswordRecovery('recovery-token');

    await expect(
      recovery.submit({ ...values, passwordConfirm: 'different' }),
    ).resolves.toMatchObject({
      status: 'invalid_input',
      field: 'passwordConfirm',
    });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    {
      error: new AuthApiError('expired', 403, 'otp_expired'),
      status: 'invalid_link',
    },
    {
      error: new AuthRetryableFetchError('response lost', 0),
      status: 'verification_uncertain',
    },
  ])(
    'リンクを検証できなければ保存しない: $status',
    async ({ error, status }) => {
      mocks.verifyOtp.mockResolvedValue({
        data: { user: null, session: null },
        error,
      });
      const recovery = createPasswordRecovery('recovery-token');

      await expect(recovery.submit(values)).resolves.toEqual({ status });
      expect(mocks.getSession).not.toHaveBeenCalled();
      expect(mocks.updateUser).not.toHaveBeenCalled();
    },
  );

  it('保存前に失敗しても、検証済みのリンクを再検証せず保存する', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError('session check failed', 0),
    });
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_failed',
    });
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledOnce();
  });

  it('検証中は保存せず、呼び出し元の入力が変わっても検証した値だけを保存する', async () => {
    const request = Promise.withResolvers<typeof verificationResponse>();
    mocks.verifyOtp.mockReturnValueOnce(request.promise);
    const recovery = createPasswordRecovery('recovery-token');
    const input = { ...values };

    const first = recovery.submit(input);
    input.password = 'short';
    input.passwordConfirm = 'different';
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'in_progress',
    });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();

    request.resolve(verificationResponse);
    await expect(first).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    expect(mocks.updateUser).toHaveBeenCalledExactlyOnceWith({
      password: values.password,
    });
  });

  it.each(['weak_password', 'same_password'])(
    '%sで拒否された場合は、同じ一時セッションで修正・再試行できる',
    async (code) => {
      mocks.updateUser.mockResolvedValueOnce({
        data: { user: null },
        error: new AuthApiError('password rejected', 422, code),
      });
      const recovery = createPasswordRecovery('recovery-token');

      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'password_rejected',
      });
      await expect(
        recovery.submit({
          password: 'new-password123',
          passwordConfirm: 'new-password123',
        }),
      ).resolves.toEqual({ status: 'saved', signOutFailed: false });
      expect(mocks.createRecoveryClient).toHaveBeenCalledOnce();
      expect(mocks.verifyOtp).toHaveBeenCalledOnce();
      expect(mocks.updateUser).toHaveBeenLastCalledWith({
        password: 'new-password123',
      });
    },
  );

  it('保存が明示的に拒否された場合は、失敗として同じ画面で再試行できる', async () => {
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('rejected', 422, 'validation_failed'),
    });
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_failed',
    });
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledTimes(2);
  });

  it.each(['same_password', 'weak_password', 'validation_failed'])(
    '保存結果不明の後に%sで拒否されても、以前の保存を失敗と断定しない',
    async (code) => {
      mocks.updateUser
        .mockResolvedValueOnce({
          data: { user: null },
          error: new AuthRetryableFetchError('response lost', 0),
        })
        .mockResolvedValueOnce({
          data: { user: null },
          error: new AuthApiError('rejected on retry', 422, code),
        });
      const recovery = createPasswordRecovery('recovery-token');

      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'update_uncertain',
      });
      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'update_uncertain',
      });
      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'saved',
        signOutFailed: false,
      });
      expect(mocks.verifyOtp).toHaveBeenCalledOnce();
      expect(mocks.updateUser).toHaveBeenCalledTimes(3);
    },
  );

  it('サーバーエラーでは保存結果不明として、同じセッションで再試行できる', async () => {
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('server failure', 500, 'unexpected_failure'),
    });
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_uncertain',
    });
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });

  it('保存中の例外でも結果不明の履歴を保持する', async () => {
    mocks.updateUser
      .mockRejectedValueOnce(new TypeError('response lost'))
      .mockResolvedValueOnce({
        data: { user: null },
        error: new AuthApiError('same password', 422, 'same_password'),
      });
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_uncertain',
    });
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_uncertain',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });

  it.each([null, { id: 'other-user' }])(
    '保存応答の本人を確認できなければ、成功と断定しない: %j',
    async (returnedUser) => {
      mocks.updateUser.mockResolvedValueOnce({
        data: { user: returnedUser },
        error: null,
      });
      const recovery = createPasswordRecovery('recovery-token');

      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'update_uncertain',
      });
    },
  );

  it.each([
    null,
    { access_token: '', user },
    { access_token: 'other-token', user: { id: 'other-user' } },
  ])(
    '保存前のセッションが使えなければ、更新せず復旧が必要な状態にする: %j',
    async (session) => {
      mocks.getSession.mockResolvedValueOnce({
        data: { session },
        error: null,
      });
      const recovery = createPasswordRecovery('recovery-token');

      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'session_expired',
      });
      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'session_expired',
      });
      expect(mocks.verifyOtp).toHaveBeenCalledOnce();
      expect(mocks.getSession).toHaveBeenCalledOnce();
      expect(mocks.updateUser).not.toHaveBeenCalled();
    },
  );

  it('保存前にセッション喪失のエラーがあれば更新しない', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthSessionMissingError(),
    });
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'session_expired',
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    new AuthSessionMissingError(),
    new AuthApiError('expired', 401, 'session_expired'),
    new AuthApiError('revoked', 401, 'refresh_token_already_used'),
  ])(
    '更新時のセッション失効は同じ画面で再試行しない: $message',
    async (error) => {
      mocks.updateUser.mockResolvedValueOnce({ data: { user: null }, error });
      const recovery = createPasswordRecovery('recovery-token');

      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'session_expired',
      });
      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'session_expired',
      });
      expect(mocks.verifyOtp).toHaveBeenCalledOnce();
      expect(mocks.updateUser).toHaveBeenCalledOnce();
    },
  );

  it('保存リクエスト前の通信エラーは、保存結果不明と区別して再試行できる', async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError('session check failed', 0),
    });
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_failed',
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledOnce();
  });

  it('保存前の例外でも処理中状態を解除し、同じセッションで再試行できる', async () => {
    mocks.getSession.mockRejectedValueOnce(
      new TypeError('session check failed'),
    );
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_failed',
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
  });

  it('以前の保存が結果不明なら、再送前の失敗でも結果不明の案内を維持する', async () => {
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthRetryableFetchError('response lost', 0),
    });
    const recovery = createPasswordRecovery('recovery-token');
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_uncertain',
    });

    mocks.getSession.mockRejectedValueOnce(
      new TypeError('session check failed'),
    );
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_uncertain',
    });
    expect(mocks.updateUser).toHaveBeenCalledOnce();
  });

  it('検証済み状態から同時送信されても保存は1回だけにする', async () => {
    const updateResponse = { data: { user }, error: null };
    const request = Promise.withResolvers<typeof updateResponse>();
    mocks.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError('session check failed', 0),
    });
    mocks.updateUser.mockReturnValueOnce(request.promise);
    const recovery = createPasswordRecovery('recovery-token');
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_failed',
    });

    const first = recovery.submit(values);
    const second = recovery.submit(values);
    await expect(second).resolves.toEqual({ status: 'in_progress' });
    await vi.waitFor(() => expect(mocks.updateUser).toHaveBeenCalledOnce());
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'in_progress',
    });
    expect(mocks.updateUser).toHaveBeenCalledOnce();

    request.resolve(updateResponse);
    await expect(first).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'already_saved',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    expect(mocks.updateUser).toHaveBeenCalledOnce();
  });
});

describe('保存後の一時ログアウト', () => {
  it.each(['error', 'exception'])(
    '一時ログアウトの%sでも保存成功を維持し、再送時も結果を保持する',
    async (failure) => {
      if (failure === 'error') {
        mocks.signOut.mockResolvedValueOnce({
          error: new AuthRetryableFetchError('logout response lost', 0),
        });
      } else {
        mocks.signOut.mockRejectedValueOnce(new TypeError('logout failed'));
      }
      const recovery = createPasswordRecovery('recovery-token');

      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'saved',
        signOutFailed: true,
      });
      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'already_saved',
        signOutFailed: true,
      });
      expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
      expect(mocks.updateUser).toHaveBeenCalledOnce();
    },
  );

  it('一時ログアウトの完了待ちでは送信を止め、完了後に保存成功を返す', async () => {
    const request = Promise.withResolvers<{ error: null }>();
    mocks.signOut.mockReturnValueOnce(request.promise);
    const recovery = createPasswordRecovery('recovery-token');
    const first = recovery.submit(values);
    await vi.waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'in_progress',
    });
    request.resolve({ error: null });
    await expect(first).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    expect(mocks.updateUser).toHaveBeenCalledOnce();
  });

  it('保存の成功を確認できなければ一時ログアウトしない', async () => {
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthRetryableFetchError('save response lost', 0),
    });
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_uncertain',
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});

describe('パスワード再設定リンクの検証', () => {
  it('処理を作成しただけではリンクを検証しない', () => {
    const recovery = createPasswordRecovery('recovery-token');

    expect(recovery).not.toHaveProperty('verify');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it.each([
    {
      input: { ...values, password: '1234567' },
      field: 'password',
      message: 'パスワードは8文字以上で入力してください',
    },
    {
      input: { ...values, passwordConfirm: '' },
      field: 'passwordConfirm',
      message: 'パスワード（確認）を入力してください',
    },
    {
      input: { ...values, passwordConfirm: 'password123' },
      field: 'passwordConfirm',
      message: 'パスワードとパスワード（確認）が一致しません',
    },
  ])(
    '入力不正はリンクを使う前に拒否する: $message',
    async ({ input, field, message }) => {
      const recovery = createPasswordRecovery('recovery-token');

      await expect(recovery.submit(input)).resolves.toEqual({
        status: 'invalid_input',
        field,
        message,
      });
      expect(mocks.verifyOtp).not.toHaveBeenCalled();
    },
  );

  it('入力を修正すると、同じ処理でリンクを検証できる', async () => {
    const recovery = createPasswordRecovery('recovery-token');

    await expect(
      recovery.submit({ ...values, password: 'short' }),
    ).resolves.toMatchObject({ status: 'invalid_input' });
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });

  it('リンクの確認情報がなければSupabaseを呼ばない', async () => {
    const recovery = createPasswordRecovery('');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'invalid_link',
    });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('再設定の種類で本人を検証し、保存失敗後も同じリンクを再使用しない', async () => {
    const recovery = createPasswordRecovery('recovery-token');
    mocks.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: new AuthApiError('rejected', 422, 'validation_failed'),
    });

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'update_failed',
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    expect(mocks.createRecoveryClient).toHaveBeenCalledOnce();
    expect(mocks.verifyOtp).toHaveBeenCalledExactlyOnceWith({
      token_hash: 'recovery-token',
      type: 'recovery',
    });
    expect(mocks.updateUser).toHaveBeenCalledTimes(2);
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it('期限切れ・無効・使用済みを表す応答なら、同じリンクを再検証しない', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('expired', 403, 'otp_expired'),
    });
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'invalid_link',
    });
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'invalid_link',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });

  it.each([
    new AuthRetryableFetchError('response lost', 0),
    new AuthApiError('server failure', 500, 'unexpected_failure'),
    new AuthApiError('unknown error', 400, 'unknown_error'),
  ])('検証結果が不明なエラーなら、再検証しない: $message', async (error) => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error,
    });
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'verification_uncertain',
    });
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'verification_uncertain',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });

  it('検証が例外で中断した場合も、結果不明として再検証しない', async () => {
    mocks.verifyOtp.mockRejectedValue(new TypeError('network failure'));
    const recovery = createPasswordRecovery('recovery-token');

    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'verification_uncertain',
    });
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'verification_uncertain',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });

  it.each([
    { label: 'セッションなし', data: { user, session: null } },
    {
      label: 'access tokenなし',
      data: { user, session: { access_token: '', user } },
    },
    {
      label: '本人なし',
      data: { user: null, session: { access_token: 'test-token', user } },
    },
    {
      label: '本人IDなし',
      data: {
        user: { id: '' },
        session: { access_token: 'test-token', user: { id: '' } },
      },
    },
    {
      label: 'セッションの本人なし',
      data: { user, session: { access_token: 'test-token', user: null } },
    },
    {
      label: '本人IDの不一致',
      data: {
        user,
        session: { access_token: 'test-token', user: { id: 'other-user' } },
      },
    },
  ])(
    '検証成功に必要な情報が揃わなければ結果不明にする: $label',
    async ({ data }) => {
      mocks.verifyOtp.mockResolvedValue({ data, error: null });
      const recovery = createPasswordRecovery('recovery-token');

      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'verification_uncertain',
      });
      await expect(recovery.submit(values)).resolves.toEqual({
        status: 'verification_uncertain',
      });
      expect(mocks.verifyOtp).toHaveBeenCalledOnce();
    },
  );

  it('検証中の二重送信を防ぎ、応答を受け取った後も再検証しない', async () => {
    const request = Promise.withResolvers<typeof verificationResponse>();
    mocks.verifyOtp.mockReturnValueOnce(request.promise);
    const recovery = createPasswordRecovery('recovery-token');

    const first = recovery.submit(values);
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'in_progress',
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();

    request.resolve(verificationResponse);
    await expect(first).resolves.toEqual({
      status: 'saved',
      signOutFailed: false,
    });
    await expect(recovery.submit(values)).resolves.toEqual({
      status: 'already_saved',
      signOutFailed: false,
    });
    expect(mocks.verifyOtp).toHaveBeenCalledOnce();
  });
});
