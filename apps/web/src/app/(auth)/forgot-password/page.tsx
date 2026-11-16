import { ClipboardCheck } from 'lucide-react';

import { ForgotPasswordForm } from './_components/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 px-4 py-8 sm:px-6">
      <div className="w-full max-w-104">
        <header className="mb-7 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
            <ClipboardCheck aria-hidden="true" className="size-4" />
          </div>
          <p className="text-sm font-semibold tracking-tight text-slate-700">
            Bluemine
          </p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">
            パスワードをお忘れの方
          </h1>
        </header>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
