'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { getCurrentUser } from '../../../../lib/auth/get-current-user';

// ログインでは形式・必須項目を検証し、パスワードの照合は Supabase に任せる。
const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'メールアドレスを入力してください')
    .pipe(z.email({ error: '有効なメールアドレスを入力してください' })),
  password: z.string().min(1, 'パスワードを入力してください'),
});

const authErrorMessages: Record<string, string> = {
  invalid_credentials: 'メールアドレスまたはパスワードが正しくありません。',
  email_not_confirmed:
    'メールアドレスの確認が完了していません。確認メールのリンクを開いてください。',
  over_request_rate_limit:
    'ログインの試行回数が多すぎます。時間をおいて再度お試しください。',
};

// Zod スキーマから、フォームの入力値の TypeScript 型を自動生成する。
type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  // 入力項目に紐付かない認証・通信エラーをフォーム上部に表示する。
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    // resolverでReact Hook Form に「検証はこの Zod スキーマで行う」と伝える
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    // 前回の認証・通信エラーを消してから、新しい送信を始める。
    setSubmitError(null);

    try {
      const supabase = createClient();
      // Supabase でログインする。
      const { data, error } = await supabase.auth.signInWithPassword(values);

      if (error) {
        // 認証エラーは項目単位ではなく、フォーム全体のエラーとして表示する。
        setSubmitError(
          authErrorMessages[error.code ?? ''] ??
            'ログインできませんでした。時間をおいて再度お試しください。',
        );
        return;
      }

      const accessToken = data.session?.access_token;

      if (!accessToken) {
        throw new Error('ログインセッションを取得できませんでした。');
      }
      // 取り出したaccessTokenを使いNestJS の GET /api/auth/me から本人のユーザー情報を取得する。
      await getCurrentUser(accessToken);

      // セッションの Cookie 保存は createBrowserClient の SDK が行う。
      // ログイン画面を履歴に残さず、サーバー側にも更新したセッションを反映する。
      router.replace('/projects');
      router.refresh();
    } catch {
      setSubmitError(
        'ログインできませんでした。時間をおいて再度お試しください。',
      );
    }
  };

  return (
    <Card className="rounded-lg border border-slate-200 bg-white py-5 shadow-sm ring-0 sm:py-6">
      <CardContent className="px-5 sm:px-6">
        <form
          aria-label="ログインフォーム"
          aria-busy={isSubmitting}
          noValidate
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-5"
        >
          {submitError && (
            <Alert variant="destructive" className="border-red-200 bg-red-50">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1">
            <Label
              htmlFor="login-email"
              className="gap-0.5 text-xs leading-normal text-slate-700"
            >
              メールアドレス
              <span aria-hidden="true" className="text-red-500">
                *
              </span>
            </Label>

            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="example@company.com"
              required
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              className="h-10 rounded border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-400 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 dark:bg-white"
              {...register('email')}
            />
            {errors.email && (
              <p id="login-email-error" className="text-xs text-red-500">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label
              htmlFor="login-password"
              className="gap-0.5 text-xs leading-normal text-slate-700"
            >
              パスワード
              <span aria-hidden="true" className="text-red-500">
                *
              </span>
            </Label>

            <div className="relative">
              <Input
                id="login-password"
                type={isPasswordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="パスワードを入力"
                required
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? 'login-password-error' : undefined
                }
                className="h-10 rounded border-slate-300 bg-white px-3 pr-12 text-slate-900 placeholder:text-slate-400 focus-visible:border-indigo-500 focus-visible:ring-1 focus-visible:ring-indigo-500 dark:bg-white"
                {...register('password')}
              />

              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={
                  isPasswordVisible
                    ? 'パスワードを非表示にする'
                    : 'パスワードを表示する'
                }
                aria-controls="login-password"
                disabled={isSubmitting}
                onClick={() => setIsPasswordVisible((isVisible) => !isVisible)}
                className="absolute top-1 right-1 h-8 w-11 rounded px-0 text-xs text-slate-500"
              >
                {isPasswordVisible ? '非表示' : '表示'}
              </Button>
            </div>
            {errors.password && (
              <p id="login-password-error" className="text-xs text-red-500">
                {errors.password.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 h-10 w-full rounded bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {isSubmitting ? 'ログイン中…' : 'ログイン'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
