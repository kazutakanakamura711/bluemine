'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  createPasswordRecovery,
  PasswordRecoveryStatus,
} from '../_lib/recovery-password';
import {
  recoveryPasswordSchema,
  type RecoveryPasswordValues,
} from '../_lib/schema/recovery-password';

const inputClassName =
  'h-8 rounded border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-400 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 dark:bg-white';
const labelClassName = 'gap-0.5 text-xs leading-4 text-slate-700';
const linkClassName =
  'text-sm font-medium text-indigo-600 underline underline-offset-4';
const invalidLinkMessage =
  '再設定リンクが無効か、期限切れ・使用済みの可能性があります。管理者にご連絡ください。';

export function ResetPasswordForm() {
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  // URLのフラグメントを読み取り済みかを保持する。
  const initialized = useRef(false);
  // 同じ画面で再試行するときも、検証後の一時セッションを含む処理を保持する。
  const recovery = useRef<ReturnType<typeof createPasswordRecovery> | null>(
    null,
  );
  const [blocked, setBlocked] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<{
    signOutFailed: boolean;
  } | null>(null);
  const linkReady = Boolean(tokenHash) && !blocked;
  const displayedError =
    submitError ?? (tokenHash === '' ? invalidLinkMessage : null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecoveryPasswordValues>({
    resolver: zodResolver(recoveryPasswordSchema),
    defaultValues: { password: '', passwordConfirm: '' },
  });

  // 再設定情報をURLに残さず、別のリンクで前の一時セッションを使わないため、
  // フラグメントを読み取って除去し、同じタブでのリンク変更を監視する。
  useEffect(() => {
    // フラグメントはHTTPリクエストに含めず、読んだ後に現在のURLから除去する。
    // Strict Modeのeffect再実行で、除去後のURLを読み直さない。
    if (!initialized.current) {
      initialized.current = true;
      const params = new URLSearchParams(window.location.hash.slice(1));
      const hashes = params.getAll('token_hash');
      const types = params.getAll('type');
      // token_hashとtypeがそれぞれ1つで、typeがrecoveryならtoken_hashを保存する。
      setTokenHash(
        hashes.length === 1 && types.length === 1 && types[0] === 'recovery'
          ? hashes[0]
          : '',
      );
      // 読み取り終わった再設定情報を、ブラウザの URL 表示から取り除く。
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname,
      );
    }
    // 同じタブで別のリンクを開いた場合も、前の一時セッションを引き継がない。
    const handleHashChange = () => {
      if (window.location.hash) window.location.reload();
    };
    // フラグメントが変わったときに呼ぶ関数。
    window.addEventListener('hashchange', handleHashChange);
    // 登録した監視を解除する処理。
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const onSubmit = async (values: RecoveryPasswordValues) => {
    if (!tokenHash) return;
    setSubmitError(null);
    try {
      recovery.current = recovery.current ?? createPasswordRecovery(tokenHash);
      const result = await recovery.current.submit(values);
      switch (result.status) {
        case PasswordRecoveryStatus.InvalidInput:
          setError(result.field, { message: result.message });
          break;
        case PasswordRecoveryStatus.PasswordRejected:
          setError('password', {
            message:
              'このパスワードは使用できません。別のパスワードをお試しください。',
          });
          break;
        case PasswordRecoveryStatus.InvalidLink:
          setBlocked(true);
          setSubmitError(invalidLinkMessage);
          break;
        case PasswordRecoveryStatus.VerificationUncertain:
          setBlocked(true);
          setSubmitError(
            '再設定リンクを確認できたか分かりません。ログインをお試しいただき、解決しない場合は管理者にご連絡ください。',
          );
          break;
        case PasswordRecoveryStatus.SessionExpired:
          setBlocked(true);
          setSubmitError(
            'この画面での再設定を続けられません。ログインをお試しいただき、解決しない場合は管理者にご連絡ください。',
          );
          break;
        case PasswordRecoveryStatus.UpdateFailed:
          setSubmitError(
            'パスワードを保存できませんでした。この画面でもう一度お試しください。',
          );
          break;
        case PasswordRecoveryStatus.UpdateUncertain:
          setSubmitError(
            'パスワードを保存できたか確認できませんでした。この画面で再試行するか、入力したパスワードでログインをお試しください。解決しない場合は管理者にご連絡ください。',
          );
          break;
        case PasswordRecoveryStatus.Saved:
        case PasswordRecoveryStatus.AlreadySaved:
          setCompletion({ signOutFailed: result.signOutFailed });
          // 入力値・リンク・専用クライアントへの画面側の参照を手放す。
          reset();
          setTokenHash(null);
          recovery.current = null;
          break;
        case PasswordRecoveryStatus.InProgress:
          break;
      }
    } catch {
      setBlocked(true);
      setSubmitError(
        '再設定を完了できたか確認できませんでした。ログインをお試しいただき、解決しない場合は管理者にご連絡ください。',
      );
    }
  };

  return (
    <Card className="rounded-lg border border-slate-200 bg-white py-6 shadow-sm ring-0">
      <CardContent className="px-6">
        {completion ? (
          <div className="space-y-4">
            <Alert role="status" className="border-indigo-200 bg-indigo-50">
              <AlertDescription className="text-indigo-700">
                パスワードの再設定が完了しました。再設定したアカウントのメールアドレスと新しいパスワードでログインしてください。
                別のアカウントでログイン中の場合は、一度ログアウトするか、別のブラウザを使ってください。
                {completion.signOutFailed &&
                  ' 安全のため、このタブを閉じてからログイン画面を開いてください。'}
              </AlertDescription>
            </Alert>
            {!completion.signOutFailed && (
              <Link href="/login" prefetch={false} className={linkClassName}>
                ログイン画面へ
              </Link>
            )}
          </div>
        ) : (
          <form
            aria-label="パスワード再設定フォーム"
            aria-busy={isSubmitting}
            noValidate
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            className="flex flex-col gap-4"
          >
            <p className="text-sm text-slate-600">
              再設定が完了するまで、再読み込みやタブを閉じないでください。
            </p>
            {displayedError && (
              <Alert variant="destructive" className="border-red-200 bg-red-50">
                <AlertDescription>{displayedError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label htmlFor="recovery-password" className={labelClassName}>
                新しいパスワード
                <span aria-hidden="true" className="text-red-500">
                  *
                </span>
              </Label>
              <Input
                id="recovery-password"
                type="password"
                autoComplete="new-password"
                placeholder="8文字以上"
                required
                disabled={!linkReady || isSubmitting}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password
                    ? 'recovery-password-error'
                    : 'recovery-password-hint'
                }
                className={inputClassName}
                {...register('password')}
              />
              {errors.password && (
                <p
                  id="recovery-password-error"
                  className="text-xs text-red-500"
                >
                  {errors.password.message}
                </p>
              )}
              <p id="recovery-password-hint" className="text-xs text-slate-500">
                8文字以上で入力してください
              </p>
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="recovery-password-confirm"
                className={labelClassName}
              >
                新しいパスワード（確認）
                <span aria-hidden="true" className="text-red-500">
                  *
                </span>
              </Label>
              <Input
                id="recovery-password-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="パスワードを再入力"
                required
                disabled={!linkReady || isSubmitting}
                aria-invalid={Boolean(errors.passwordConfirm)}
                aria-describedby={
                  errors.passwordConfirm
                    ? 'recovery-password-confirm-error'
                    : undefined
                }
                className={inputClassName}
                {...register('passwordConfirm')}
              />
              {errors.passwordConfirm && (
                <p
                  id="recovery-password-confirm-error"
                  className="text-xs text-red-500"
                >
                  {errors.passwordConfirm.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={!linkReady || isSubmitting}
              className="mt-1 w-full rounded bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/50"
            >
              {isSubmitting ? '保存中…' : 'パスワードを再設定'}
            </Button>
            <Link
              href="/login"
              prefetch={false}
              className={`text-center ${linkClassName}`}
            >
              ログイン画面へ
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
