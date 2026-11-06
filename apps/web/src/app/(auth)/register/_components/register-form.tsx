'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

// 登録の入力条件と、確認用パスワードとの一致を検証する。
const registerSchema = z
  .object({
    name: z.string().trim().min(1, '名前を入力してください'),
    email: z
      .string()
      .trim()
      .min(1, 'メールアドレスを入力してください')
      .pipe(z.email({ error: '有効なメールアドレスを入力してください' })),
    password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
    passwordConfirm: z.string().min(1, 'パスワード（確認）を入力してください'),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'パスワードとパスワード（確認）が一致しません',
    path: ['passwordConfirm'],
  });

const authErrorMessages: Record<string, string> = {
  user_already_exists:
    'このメールアドレスはすでに登録されています。ログインをお試しください。',
  weak_password:
    'パスワードの条件を満たしていません。別のパスワードをお試しください。',
  over_email_send_rate_limit:
    '確認メールの送信回数が多すぎます。時間をおいて再度お試しください。',
  over_request_rate_limit:
    '登録の試行回数が多すぎます。時間をおいて再度お試しください。',
  signup_disabled: '現在、新規登録を受け付けていません。',
};

// Zod スキーマから、フォームの入力値の TypeScript 型を自動生成する。
type RegisterFormValues = z.infer<typeof registerSchema>;

const inputClassName =
  'h-8 rounded border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-400 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 dark:bg-white';

const labelClassName = 'gap-0.5 text-xs leading-4 text-slate-700';

export function RegisterForm() {
  // 入力項目に紐付かない認証・通信エラーをフォーム上部に表示する。
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    // resolverでReact Hook Form に「検証はこの Zod スキーマで行う」と伝える
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      passwordConfirm: '',
    },
  });

  const onSubmit = async (values: RegisterFormValues) => {
    // 前回の認証・通信エラーを消してから、新しい送信を始める。
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const supabase = createClient();
      // 確認用パスワードは送らず、名前は追加のユーザー情報として保存する。
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: { name: values.name },
        },
      });

      if (error) {
        setSubmitError(
          authErrorMessages[error.code ?? ''] ??
            '登録に失敗しました。時間をおいて再度お試しください。',
        );
        return;
      }

      if (!data.user) {
        throw new Error('登録結果を取得できませんでした。');
      }

      // メール確認が必要な設定では、登録時にセッションは返らない。
      setSubmitSuccess(
        data.session
          ? 'アカウントを作成しました。下のリンクからログイン画面へお進みください。'
          : '登録を受け付けました。確認メールのリンクを開くと、メール確認が完了し、自動的にアプリへ進みます。',
      );
    } catch {
      setSubmitError('登録に失敗しました。時間をおいて再度お試しください。');
    }
  };

  return (
    <Card className="rounded-lg border border-slate-200 bg-white py-6 shadow-sm ring-0">
      <CardContent className="px-6">
        <form
          aria-label="新規登録フォーム"
          aria-busy={isSubmitting}
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          {submitError && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {submitSuccess && (
            <Alert role="status" className="border-indigo-200 bg-indigo-50">
              <AlertDescription className="text-indigo-700">
                {submitSuccess}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1">
            <Label htmlFor="register-name" className={labelClassName}>
              名前
              <span aria-hidden="true" className="text-red-500">
                *
              </span>
            </Label>
            <Input
              id="register-name"
              type="text"
              autoComplete="name"
              placeholder="山田 太郎"
              required
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'register-name-error' : undefined}
              className={inputClassName}
              {...register('name')}
            />
            {errors.name && (
              <p id="register-name-error" className="text-xs text-red-500">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="register-email" className={labelClassName}>
              メールアドレス
              <span aria-hidden="true" className="text-red-500">
                *
              </span>
            </Label>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="example@company.com"
              required
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? 'register-email-error' : undefined
              }
              className={inputClassName}
              {...register('email')}
            />
            {errors.email && (
              <p id="register-email-error" className="text-xs text-red-500">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="register-password" className={labelClassName}>
              パスワード
              <span aria-hidden="true" className="text-red-500">
                *
              </span>
            </Label>
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              placeholder="8文字以上"
              aria-describedby={
                errors.password
                  ? 'register-password-error'
                  : 'register-password-hint'
              }
              required
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.password)}
              className={inputClassName}
              {...register('password')}
            />
            {errors.password && (
              <p id="register-password-error" className="text-xs text-red-500">
                {errors.password.message}
              </p>
            )}
            <p id="register-password-hint" className="text-xs text-slate-500">
              8文字以上で入力してください
            </p>
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="register-password-confirm"
              className={labelClassName}
            >
              パスワード（確認）
              <span aria-hidden="true" className="text-red-500">
                *
              </span>
            </Label>
            <Input
              id="register-password-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="パスワードを再入力"
              required
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.passwordConfirm)}
              aria-describedby={
                errors.passwordConfirm
                  ? 'register-password-confirm-error'
                  : undefined
              }
              className={inputClassName}
              {...register('passwordConfirm')}
            />
            {errors.passwordConfirm && (
              <p
                id="register-password-confirm-error"
                className="text-xs text-red-500"
              >
                {errors.passwordConfirm.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="mt-1 w-full rounded bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:border-indigo-500 focus-visible:ring-indigo-500/50"
          >
            {isSubmitting ? 'アカウント作成中…' : 'アカウントを作成'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
