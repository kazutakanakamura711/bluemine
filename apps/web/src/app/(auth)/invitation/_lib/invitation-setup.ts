import {
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js';

import { createInvitationClient } from './invitation-client';

// 初期設定画面から受け取る入力。確認用パスワードは一致の確認だけに使う。
type InvitationSetupValues = {
  name: string;
  password: string;
  passwordConfirm: string;
};

// submit の結果を画面に伝える値。画面側はこの値に応じて案内を切り替える。
export const InvitationSetupStatus = {
  InvalidInput: 'invalid_input', // 画面の入力条件を満たさない
  InProgress: 'in_progress', // 前回の送信を処理中
  InvalidInvitation: 'invalid_invitation', // 招待情報がない、無効、期限切れ、使用済み
  VerificationUncertain: 'verification_uncertain', // 招待を検証できたか分からない
  PasswordRejected: 'password_rejected', // Supabase がパスワードを拒否した
  UpdateFailed: 'update_failed', // 名前・パスワードの保存に失敗した
  UpdateUncertain: 'update_uncertain', // 保存できたか分からない
  SessionExpired: 'session_expired', // 招待用の一時セッションを使えない
  AlreadyCompleted: 'already_completed', // すでに初期設定が完了している
  Success: 'success', // 初期設定の保存が完了した
} as const;

export type InvitationSetupStatus =
  (typeof InvitationSetupStatus)[keyof typeof InvitationSetupStatus];

// status ごとに返す追加情報を変える。
// InvalidInput は対象の field、Success は一時ログアウトの成否を持つ。
export type InvitationSetupResult =
  | {
      status: typeof InvitationSetupStatus.InvalidInput;
      field: 'name' | 'password' | 'passwordConfirm';
    }
  | { status: typeof InvitationSetupStatus.InProgress }
  | { status: typeof InvitationSetupStatus.InvalidInvitation }
  | { status: typeof InvitationSetupStatus.VerificationUncertain }
  | { status: typeof InvitationSetupStatus.PasswordRejected }
  | { status: typeof InvitationSetupStatus.UpdateFailed }
  | { status: typeof InvitationSetupStatus.UpdateUncertain }
  | { status: typeof InvitationSetupStatus.SessionExpired }
  | { status: typeof InvitationSetupStatus.AlreadyCompleted }
  | { status: typeof InvitationSetupStatus.Success; signOutFailed: boolean };

// 画面に返す status とは別に、この処理の内部で現在の進み具合を保持する。
const InvitationSetupPhase = {
  Unverified: 'unverified',
  Verified: 'verified',
  Uncertain: 'uncertain',
  Expired: 'expired',
  Completed: 'completed',
} as const;

type InvitationSetupPhase =
  (typeof InvitationSetupPhase)[keyof typeof InvitationSetupPhase];

// tokenHash は招待メールのリンクに含まれる確認用の値。
// 1つの招待につき1回作り、保存に失敗した場合も同じ一時セッションで再試行する。
export function createInvitationSetup(tokenHash: string) {
  const supabase = createInvitationClient();
  // state と supabase は、返却する submit を呼び直しても同じものを使う。
  // そのため画面側は送信のたびに createInvitationSetup を作り直さない。
  const state: {
    phase: InvitationSetupPhase;
    isSubmitting: boolean;
    userId: string | null;
    hasUncertainUpdate: boolean;
  } = {
    phase: InvitationSetupPhase.Unverified,
    isSubmitting: false,
    userId: null,
    // 応答が届かず保存済みか不明になったことを、再試行後も覚えておく。
    hasUncertainUpdate: false,
  };

  async function submit(
    values: InvitationSetupValues,
  ): Promise<InvitationSetupResult> {
    // 二重送信と、完了後・復旧が必要な状態での再実行を防ぐ。
    if (state.isSubmitting) return { status: InvitationSetupStatus.InProgress };
    if (state.phase === InvitationSetupPhase.Completed)
      return { status: InvitationSetupStatus.AlreadyCompleted };
    if (state.phase === InvitationSetupPhase.Uncertain)
      return { status: InvitationSetupStatus.VerificationUncertain };
    if (state.phase === InvitationSetupPhase.Expired)
      return { status: InvitationSetupStatus.SessionExpired };

    // 招待リンクを消費する前に入力を確認する。パスワード自体は trim しない。
    const name = values.name.trim();
    if (!name)
      return { status: InvitationSetupStatus.InvalidInput, field: 'name' };
    if (values.password.length < 8) {
      return { status: InvitationSetupStatus.InvalidInput, field: 'password' };
    }
    if (values.password !== values.passwordConfirm) {
      return {
        status: InvitationSetupStatus.InvalidInput,
        field: 'passwordConfirm',
      };
    }
    if (!tokenHash) return { status: InvitationSetupStatus.InvalidInvitation };

    // await 中にもう一度 submit されても処理が重ならないようにする。
    state.isSubmitting = true;
    try {
      // 最初の送信時だけ招待を検証する。Verified の再試行ではここを通らない。
      if (state.phase === InvitationSetupPhase.Unverified) {
        try {
          // Supabase が招待を検証し、成功すると招待先ユーザーの一時セッションを返す。
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'invite',
          });

          // 期限切れ・使用済みなど、招待を受け付けられない場合。
          if (
            error?.code === 'otp_expired' ||
            error?.code === 'invite_not_found'
          ) {
            return { status: InvitationSetupStatus.InvalidInvitation };
          }
          // 通信エラーや不完全な応答では招待が消費されたか判断できない。
          // セッションとユーザーの ID も照合し、確認できなければ保存しない。
          if (
            error ||
            !data.session?.access_token ||
            !data.user?.id ||
            data.session.user?.id !== data.user.id
          ) {
            state.phase = InvitationSetupPhase.Uncertain;
            return { status: InvitationSetupStatus.VerificationUncertain };
          }
          // 確認できた本人の ID を保存時にも照合する。
          state.phase = InvitationSetupPhase.Verified;
          state.userId = data.user.id;
        } catch {
          // 例外でも Supabase 側で招待が消費された可能性があるため、再検証しない。
          state.phase = InvitationSetupPhase.Uncertain;
          return { status: InvitationSetupStatus.VerificationUncertain };
        }
      }

      try {
        // 検証済みの一時セッションを使い、同じユーザーの名前とパスワードを更新する。
        const { data, error } = await supabase.auth.updateUser({
          password: values.password,
          data: { name },
        });

        // Supabase のパスワード条件で拒否された場合は入力し直せる。
        if (error?.code === 'weak_password' && !state.hasUncertainUpdate)
          return { status: InvitationSetupStatus.PasswordRejected };
        // セッションが使えなくなった場合は、同じ画面での再試行ではなく復旧が必要。
        if (
          error &&
          (isAuthSessionMissingError(error) ||
            error.code === 'session_expired' ||
            error.code === 'session_not_found' ||
            error.code === 'refresh_token_not_found')
        ) {
          state.phase = InvitationSetupPhase.Expired;
          return { status: InvitationSetupStatus.SessionExpired };
        }
        // 通信・サーバーエラーでは保存済みか断定できない。それ以外のエラーとは分ける。
        if (error) {
          if (
            isAuthRetryableFetchError(error) ||
            !error.status ||
            error.status >= 500
          ) {
            state.hasUncertainUpdate = true;
          }
          // 再送が same_password などで拒否されても、前回は保存済みかもしれない。
          // 今回の拒否だけを根拠に「設定を保存できなかった」とは案内しない。
          return {
            status: state.hasUncertainUpdate
              ? InvitationSetupStatus.UpdateUncertain
              : InvitationSetupStatus.UpdateFailed,
          };
        }
        // 保存結果が検証済みの本人か確認できない場合も、成功とは断定しない。
        if (!data.user?.id || data.user.id !== state.userId) {
          state.hasUncertainUpdate = true;
          return { status: InvitationSetupStatus.UpdateUncertain };
        }
      } catch {
        // 応答が届かなかった場合、Supabase側で保存済みかどうかは分からない。
        state.hasUncertainUpdate = true;
        return { status: InvitationSetupStatus.UpdateUncertain };
      }

      // 保存できた後は再送しない。signOut の成否と保存の成否は別に扱う。
      state.phase = InvitationSetupPhase.Completed;
      try {
        // local はこの一時セッションだけが対象。既定の global は他のセッションにも影響する。
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        return {
          status: InvitationSetupStatus.Success,
          signOutFailed: Boolean(error),
        };
      } catch {
        return { status: InvitationSetupStatus.Success, signOutFailed: true };
      }
    } finally {
      // 成功・失敗・例外のどの場合も送信中の状態を解除する。
      state.isSubmitting = false;
    }
  }

  return { submit };
}
