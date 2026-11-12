'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  createInvitationSetup,
  InvitationSetupStatus,
} from '../_lib/invitation-setup';

const schema = z
  .object({
    name: z.string().trim().min(1, '名前を入力してください'),
    password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
    passwordConfirm: z.string().min(1, 'パスワード（確認）を入力してください'),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: 'パスワードとパスワード（確認）が一致しません',
    path: ['passwordConfirm'],
  });

type FormValues = z.infer<typeof schema>;

const inputClassName =
  'h-8 rounded border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-400 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 dark:bg-white';
const labelClassName = 'gap-0.5 text-xs leading-4 text-slate-700';
const invalidLinkMessage =
  '招待リンクが無効か、期限切れの可能性があります。管理者にご連絡ください。';

export function InvitationForm() {
  // 招待情報と処理をこの画面のメモリにだけ保持する。
  const [tokenHash, setTokenHash] = useState<string | null>(null);
  const initialized = useRef(false);
  const setup = useRef<ReturnType<typeof createInvitationSetup> | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const linkReady = Boolean(tokenHash) && !blocked;
  const displayedError =
    submitError ?? (tokenHash === '' ? invalidLinkMessage : null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', password: '', passwordConfirm: '' },
  });

  useEffect(() => {
    // # 以降は HTTP リクエストに含まれないため、サーバーの URL ログに残らない。
    // Strict Mode の effect 再実行で除去後の URL を読み直さない。
    if (!initialized.current) {
      initialized.current = true;
      const params = new URLSearchParams(window.location.hash.slice(1));
      const hashes = params.getAll('token_hash');
      const types = params.getAll('type');
      const token =
        hashes.length === 1 && types.length === 1 && types[0] === 'invite'
          ? hashes[0]
          : '';
      // URL はブラウザでのみ読めるため、初回の同期後に表示状態を更新する。
      setTokenHash(token);
      // トークンをブラウザのアドレス欄・現在の履歴から取り除く。
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname,
      );
    }

    // 同じ画面で別の招待リンクを開くと、# 以降だけが変わることがある。
    // 前の招待の一時セッションを使い回さないよう、画面を初めから開き直す。
    const handleHashChange = () => {
      if (window.location.hash) window.location.reload();
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const onSubmit = async (values: FormValues) => {
    if (!tokenHash) return;
    setSubmitError(null);

    try {
      // 作成は最初の送信時だけ。再試行でも同じ一時セッションを使う。
      setup.current ??= createInvitationSetup(tokenHash);
      const result = await setup.current.submit(values);
      switch (result.status) {
        case InvitationSetupStatus.InvalidInput: {
          const messages = {
            name: '名前を入力してください',
            password: 'パスワードは8文字以上で入力してください',
            passwordConfirm: 'パスワードとパスワード（確認）が一致しません',
          };
          setError(result.field, { message: messages[result.field] });
          break;
        }
        case InvitationSetupStatus.PasswordRejected:
          setError('password', {
            message:
              'パスワードの条件を満たしていません。別のパスワードをお試しください。',
          });
          break;
        case InvitationSetupStatus.InvalidInvitation:
          setBlocked(true);
          setSubmitError(invalidLinkMessage);
          break;
        case InvitationSetupStatus.VerificationUncertain:
        case InvitationSetupStatus.SessionExpired:
          setBlocked(true);
          setSubmitError(
            '招待の初期設定を続けられません。管理者にご連絡ください。',
          );
          break;
        case InvitationSetupStatus.UpdateFailed:
          setSubmitError(
            '設定を保存できませんでした。この画面でもう一度お試しください。',
          );
          break;
        case InvitationSetupStatus.UpdateUncertain:
          setSubmitError(
            '設定を保存できたか確認できませんでした。この画面で再試行するか、ログインをお試しください。解決しない場合は管理者にご連絡ください。',
          );
          break;
        case InvitationSetupStatus.Success:
          setSignOutFailed(result.signOutFailed);
          setFinished(true);
          break;
        case InvitationSetupStatus.AlreadyCompleted:
          setFinished(true);
          break;
        case InvitationSetupStatus.InProgress:
          break;
      }
    } catch {
      setSubmitError(
        '初期設定を完了できたか確認できませんでした。ログインをお試しいただき、解決しない場合は管理者にご連絡ください。',
      );
    }
  };

  return (
    <Card className="rounded-lg border border-slate-200 bg-white py-6 shadow-sm ring-0">
      <CardContent className="px-6">
        {finished ? (
          <div className="space-y-4">
            <Alert role="status" className="border-indigo-200 bg-indigo-50">
              <AlertDescription className="text-indigo-700">
                初期設定が完了しました。招待されたメールアドレスと設定したパスワードでログインしてください。
                別のアカウントでログイン中の場合は、一度ログアウトするか、別のブラウザを使ってください。
                {signOutFailed &&
                  ' 安全のため、このタブを閉じてからログイン画面を開いてください。'}
              </AlertDescription>
            </Alert>
            {!signOutFailed && (
              <Link
                href="/login"
                prefetch={false}
                className="text-sm font-medium text-indigo-600 underline underline-offset-4"
              >
                ログイン画面へ
              </Link>
            )}
          </div>
        ) : (
          <form
            aria-label="招待の初期設定フォーム"
            aria-busy={isSubmitting}
            noValidate
            onSubmit={(event) => void handleSubmit(onSubmit)(event)}
            className="flex flex-col gap-4"
          >
            <p className="text-sm text-slate-600">
              設定が完了するまで、再読み込みやタブを閉じないでください。
            </p>
            {displayedError && (
              <Alert variant="destructive" className="border-red-200 bg-red-50">
                <AlertDescription>{displayedError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label htmlFor="invitation-name" className={labelClassName}>
                名前
                <span aria-hidden="true" className="text-red-500">
                  *
                </span>
              </Label>
              <Input
                id="invitation-name"
                type="text"
                autoComplete="name"
                placeholder="山田 太郎"
                required
                disabled={!linkReady || isSubmitting}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={
                  errors.name ? 'invitation-name-error' : undefined
                }
                className={inputClassName}
                {...register('name')}
              />
              {errors.name && (
                <p id="invitation-name-error" className="text-xs text-red-500">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="invitation-password" className={labelClassName}>
                パスワード
                <span aria-hidden="true" className="text-red-500">
                  *
                </span>
              </Label>
              <Input
                id="invitation-password"
                type="password"
                autoComplete="new-password"
                placeholder="8文字以上"
                required
                disabled={!linkReady || isSubmitting}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password
                    ? 'invitation-password-error'
                    : 'invitation-password-hint'
                }
                className={inputClassName}
                {...register('password')}
              />
              {errors.password && (
                <p
                  id="invitation-password-error"
                  className="text-xs text-red-500"
                >
                  {errors.password.message}
                </p>
              )}
              <p
                id="invitation-password-hint"
                className="text-xs text-slate-500"
              >
                8文字以上で入力してください
              </p>
            </div>
            <div className="space-y-1">
              <Label
                htmlFor="invitation-password-confirm"
                className={labelClassName}
              >
                パスワード（確認）
                <span aria-hidden="true" className="text-red-500">
                  *
                </span>
              </Label>
              <Input
                id="invitation-password-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="パスワードを再入力"
                required
                disabled={!linkReady || isSubmitting}
                aria-invalid={Boolean(errors.passwordConfirm)}
                aria-describedby={
                  errors.passwordConfirm
                    ? 'invitation-password-confirm-error'
                    : undefined
                }
                className={inputClassName}
                {...register('passwordConfirm')}
              />
              {errors.passwordConfirm && (
                <p
                  id="invitation-password-confirm-error"
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
              {isSubmitting ? '設定中…' : '初期設定を完了'}
            </Button>
            <Link
              href="/login"
              prefetch={false}
              className="text-center text-sm font-medium text-indigo-600 underline underline-offset-4"
            >
              ログイン画面へ
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
