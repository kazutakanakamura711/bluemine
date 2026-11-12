import { Clipboard } from 'lucide-react';

import { InvitationForm } from './_components/invitation-form';

// 招待画面の応答を使い回さない方針を明確にするため、
// このページは静的に事前生成せず、リクエストごとに描画する。
// ブラウザなどへのキャッシュ防止は、next.config.ts のヘッダーで別に指定する。
export const dynamic = 'force-dynamic';

export default function InvitationPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-100">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Clipboard aria-hidden="true" className="size-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Bluemine</h1>
          <p className="mt-1 text-sm text-slate-500">
            招待アカウントの初期設定
          </p>
        </header>
        <InvitationForm />
      </div>
    </main>
  );
}
