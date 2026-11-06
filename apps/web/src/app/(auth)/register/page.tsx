import { Clipboard } from 'lucide-react';
import Link from 'next/link';

import { RegisterForm } from './_components/register-form';

export default function RegisterPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-100">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Clipboard aria-hidden="true" className="size-6" />
          </div>

          <h1 className="text-xl font-bold text-slate-900">Bluemine</h1>
          <p className="mt-1 text-sm text-slate-500">新規アカウント登録</p>
        </header>

        <RegisterForm />

        <p className="mt-4 text-center text-xs text-slate-500">
          すでにアカウントをお持ちの方は{' '}
          <Link
            href="/login"
            prefetch={false}
            className="rounded py-1 font-medium text-indigo-600 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            ログイン
          </Link>
        </p>
      </div>
    </main>
  );
}
