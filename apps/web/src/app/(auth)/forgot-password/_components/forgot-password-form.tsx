'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createRecoveryClient } from '../../reset-password/_lib/recovery-client';
import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from '../_lib/schema/forgot-password';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit({ email }: ForgotPasswordValues) {
    setSubmitError(null);
    try {
      // 認証情報の発行とメールの送信は Supabase Auth に任せる。
      const { error } =
        await createRecoveryClient().auth.resetPasswordForEmail(email);
      if (error) throw error;
      setSent(true);
    } catch {
      // 通信が途切れた場合はメールが送られたか分からない。
      setSubmitError(
        'メールを送信できたか確認できませんでした。受信箱を確認し、届かない場合は時間をおいて再度お試しください。',
      );
    }
  }

  return (
    <Card className="rounded-lg border border-slate-200 bg-white py-6 shadow-sm ring-0">
      <CardContent className="px-5 sm:px-6">
        {sent ? (
          <Alert role="status" className="border-indigo-200 bg-indigo-50">
            <AlertDescription className="text-indigo-700">
              入力されたメールアドレスにアカウントがある場合、再設定メールが届きます。受信箱をご確認ください。
            </AlertDescription>
          </Alert>
        ) : (
          <form
            aria-label="再設定メールの依頼フォーム"
            aria-busy={isSubmitting}
            noValidate
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            <p className="text-sm text-slate-600">
              登録したメールアドレスを入力してください。
            </p>
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label htmlFor="forgot-email">
                メールアドレス <span aria-hidden="true">*</span>
              </Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={
                  errors.email ? 'forgot-email-error' : undefined
                }
                {...register('email')}
              />
              {errors.email && (
                <p id="forgot-email-error" className="text-xs text-red-500">
                  {errors.email.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {isSubmitting ? '送信中…' : '再設定メールを送信'}
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-sm">
          <Link
            href="/login"
            prefetch={false}
            className="text-indigo-600 underline underline-offset-4"
          >
            ログイン画面へ
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
