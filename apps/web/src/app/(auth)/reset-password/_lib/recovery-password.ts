import {
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type AuthError,
} from '@supabase/supabase-js';

import { createRecoveryClient } from './recovery-client';
import {
  recoveryPasswordSchema,
  type RecoveryPasswordValues,
} from './schema/recovery-password';

// Verified はリンクの検証完了を表す。パスワードの保存完了ではない。
export const PasswordRecoveryStatus = {
  InvalidInput: 'invalid_input',
  InProgress: 'in_progress',
  InvalidLink: 'invalid_link',
  VerificationUncertain: 'verification_uncertain',
  Verified: 'verified',
  SessionExpired: 'session_expired',
  PasswordRejected: 'password_rejected',
  UpdateFailed: 'update_failed',
  UpdateUncertain: 'update_uncertain',
  Saved: 'saved',
  AlreadySaved: 'already_saved',
} as const;

export type PasswordRecoveryStatus =
  (typeof PasswordRecoveryStatus)[keyof typeof PasswordRecoveryStatus];

export type PasswordRecoveryVerificationResult =
  | {
      status: typeof PasswordRecoveryStatus.InvalidInput;
      field: keyof RecoveryPasswordValues;
      message: string;
    }
  | { status: typeof PasswordRecoveryStatus.InProgress }
  | { status: typeof PasswordRecoveryStatus.InvalidLink }
  | { status: typeof PasswordRecoveryStatus.VerificationUncertain }
  | { status: typeof PasswordRecoveryStatus.SessionExpired }
  | { status: typeof PasswordRecoveryStatus.Verified };

// submit はリンク検証だけで終わらず、保存の結果まで返す。
export type PasswordRecoverySubmitResult =
  | Exclude<
      PasswordRecoveryVerificationResult,
      { status: typeof PasswordRecoveryStatus.Verified }
    >
  | { status: typeof PasswordRecoveryStatus.PasswordRejected }
  | { status: typeof PasswordRecoveryStatus.UpdateFailed }
  | { status: typeof PasswordRecoveryStatus.UpdateUncertain }
  | { status: typeof PasswordRecoveryStatus.Saved; signOutFailed: boolean }
  | {
      status: typeof PasswordRecoveryStatus.AlreadySaved;
      signOutFailed: boolean;
    };

function isSessionUnavailable(error: AuthError) {
  return (
    isAuthSessionMissingError(error) ||
    error.code === 'session_expired' ||
    error.code === 'session_not_found' ||
    error.code === 'refresh_token_not_found' ||
    error.code === 'refresh_token_already_used'
  );
}

// 1つの再設定リンクにつき1回作り、画面を開いている間は同じ処理を使う。
export function createPasswordRecovery(tokenHash: string) {
  const supabase = createRecoveryClient();
  // 本人のIDと一時セッションは処理内に保持し、呼び出し元へ認証情報を返さない。
  const state: {
    isVerifying: boolean;
    isSaving: boolean;
    isSaved: boolean;
    signOutFailed: boolean;
    hasUncertainUpdate: boolean;
    verifiedUserId: string | null;
    blockedStatus:
      | typeof PasswordRecoveryStatus.InvalidLink
      | typeof PasswordRecoveryStatus.VerificationUncertain
      | typeof PasswordRecoveryStatus.SessionExpired
      | null;
  } = {
    isVerifying: false,
    isSaving: false,
    isSaved: false,
    signOutFailed: false,
    hasUncertainUpdate: false,
    verifiedUserId: null,
    blockedStatus: null,
  };

  async function verify(
    values: RecoveryPasswordValues,
  ): Promise<PasswordRecoveryVerificationResult> {
    if (state.isVerifying || state.isSaving)
      return { status: PasswordRecoveryStatus.InProgress };
    if (state.blockedStatus) return { status: state.blockedStatus };

    // 入力の修正で再設定リンクを消費しないよう、通信より先に検証する。
    const parsed = recoveryPasswordSchema.safeParse(values);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        status: PasswordRecoveryStatus.InvalidInput,
        field:
          issue.path[0] === 'passwordConfirm' ? 'passwordConfirm' : 'password',
        message: issue.message,
      };
    }

    // 検証済みのリンクは再使用しない。一時セッションの現在の有効性とは別の記録。
    if (state.verifiedUserId)
      return { status: PasswordRecoveryStatus.Verified };
    if (!tokenHash) {
      state.blockedStatus = PasswordRecoveryStatus.InvalidLink;
      return { status: state.blockedStatus };
    }

    state.isVerifying = true;
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });

      if (error?.code === 'otp_expired') {
        state.blockedStatus = PasswordRecoveryStatus.InvalidLink;
        return { status: state.blockedStatus };
      }
      // 通信エラーや不完全な応答では、リンクが消費されたか判断できない。
      // セッションと本人のIDが一致することも、検証成功の条件にする。
      if (
        error ||
        !data?.session?.access_token ||
        !data.user?.id ||
        data.session.user?.id !== data.user.id
      ) {
        state.blockedStatus = PasswordRecoveryStatus.VerificationUncertain;
        return { status: state.blockedStatus };
      }

      state.verifiedUserId = data.user.id;
      return { status: PasswordRecoveryStatus.Verified };
    } catch {
      // 応答の喪失や例外でも、同じリンクを再検証して結果を推測しない。
      state.blockedStatus = PasswordRecoveryStatus.VerificationUncertain;
      return { status: state.blockedStatus };
    } finally {
      state.isVerifying = false;
    }
  }

  function updateFailureResult() {
    return {
      status: state.hasUncertainUpdate
        ? PasswordRecoveryStatus.UpdateUncertain
        : PasswordRecoveryStatus.UpdateFailed,
    };
  }

  async function submit(
    values: RecoveryPasswordValues,
  ): Promise<PasswordRecoverySubmitResult> {
    if (state.isVerifying || state.isSaving)
      return { status: PasswordRecoveryStatus.InProgress };
    if (state.isSaved)
      return {
        status: PasswordRecoveryStatus.AlreadySaved,
        signOutFailed: state.signOutFailed,
      };

    // await中に呼び出し元の入力が変わっても、検証した値だけを保存する。
    const input = {
      password: values.password,
      passwordConfirm: values.passwordConfirm,
    };
    const verification = await verify(input);
    if (verification.status !== PasswordRecoveryStatus.Verified)
      return verification;

    // 検証済み状態から複数のsubmitが進んだ場合も、保存は1つだけにする。
    if (state.isSaving) return { status: PasswordRecoveryStatus.InProgress };
    if (state.isSaved)
      return {
        status: PasswordRecoveryStatus.AlreadySaved,
        signOutFailed: state.signOutFailed,
      };

    state.isSaving = true;
    // 保存リクエスト前の失敗と、保存結果が分からない失敗を区別する。
    const attempt = { updateStarted: false };
    try {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      if (sessionError) {
        if (isSessionUnavailable(sessionError)) {
          state.blockedStatus = PasswordRecoveryStatus.SessionExpired;
          return { status: state.blockedStatus };
        }
        return updateFailureResult();
      }
      // この専用クライアントが、検証した本人のセッションを保持しているか照合する。
      if (
        !sessionData.session?.access_token ||
        sessionData.session.user?.id !== state.verifiedUserId
      ) {
        state.blockedStatus = PasswordRecoveryStatus.SessionExpired;
        return { status: state.blockedStatus };
      }

      attempt.updateStarted = true;
      // 名前・確認用パスワード・任意のユーザーIDは送らない。
      const { data, error } = await supabase.auth.updateUser({
        password: input.password,
      });
      if (error) {
        if (isSessionUnavailable(error)) {
          state.blockedStatus = PasswordRecoveryStatus.SessionExpired;
          return { status: state.blockedStatus };
        }
        if (
          !state.hasUncertainUpdate &&
          (error.code === 'weak_password' || error.code === 'same_password')
        ) {
          return { status: PasswordRecoveryStatus.PasswordRejected };
        }
        if (
          isAuthRetryableFetchError(error) ||
          !error.status ||
          error.status >= 500
        ) {
          state.hasUncertainUpdate = true;
        }
        // 再送が拒否されても、以前の保存結果が不明だったことを保持する。
        return updateFailureResult();
      }

      if (!data?.user?.id || data.user.id !== state.verifiedUserId) {
        state.hasUncertainUpdate = true;
        return { status: PasswordRecoveryStatus.UpdateUncertain };
      }

      state.isSaved = true;
      try {
        // この専用クライアントの一時セッションだけを終了する。
        const { error: signOutError } = await supabase.auth.signOut({
          scope: 'local',
        });
        state.signOutFailed = Boolean(signOutError);
      } catch {
        // 一時ログアウトの失敗で、確認できた保存成功を取り消さない。
        state.signOutFailed = true;
      }
      return {
        status: PasswordRecoveryStatus.Saved,
        signOutFailed: state.signOutFailed,
      };
    } catch {
      if (attempt.updateStarted) state.hasUncertainUpdate = true;
      return updateFailureResult();
    } finally {
      state.isSaving = false;
    }
  }

  return { verify, submit };
}
