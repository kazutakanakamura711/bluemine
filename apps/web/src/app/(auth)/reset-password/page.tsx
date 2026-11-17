import { Clipboard } from 'lucide-react';

import { ResetPasswordForm } from './_components/reset-password-form';

// 確認情報を扱う画面は静的に生成せず、キャッシュ防止のヘッダーも付ける。
export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-100">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Clipboard aria-hidden="true" className="size-6" />
          </div>
          <p className="text-sm font-semibold text-slate-700">Bluemine</p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">
            パスワードの再設定
          </h1>
        </header>
        <ResetPasswordForm />
      </div>
    </main>
  );
}
