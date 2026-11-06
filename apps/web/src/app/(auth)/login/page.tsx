import { ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { LoginForm } from './_components/login-form';
import { Alert, AlertDescription } from '@/components/ui/alert';

type LoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const isConfirmationFailed = error === 'confirmation_failed';

  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 px-4 py-8 sm:px-6">
      <div className="w-full max-w-104">
        <header className="mb-7 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
            <ClipboardCheck
              aria-hidden="true"
              className="size-4"
              strokeWidth={1.75}
            />
          </div>

          <p className="text-sm font-semibold tracking-tight text-slate-700">
            Bluemine
          </p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">ログイン</h1>
          <p className="mt-1.5 text-xs text-slate-500">
            プロジェクトとタスクを一つの場所で管理
          </p>
        </header>

        {isConfirmationFailed && (
          <Alert
            variant="destructive"
            className="mb-4 border-red-200 bg-red-50"
          >
            <AlertDescription>
              メールアドレスを確認できませんでした。
              リンクが無効か、有効期限が切れている可能性があります。
              すでに確認済みの場合はログインしてください。
            </AlertDescription>
          </Alert>
        )}

        <LoginForm />

        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-1 text-xs text-slate-500">
          アカウントをお持ちでない方は
          <Link
            href="/register"
            prefetch={false}
            className="rounded px-1 py-1 font-semibold text-slate-700 underline-offset-4 outline-none hover:text-indigo-600 hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            新規登録
          </Link>
        </p>
      </div>
    </main>
  );
}
