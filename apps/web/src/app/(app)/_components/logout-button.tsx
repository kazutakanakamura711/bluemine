'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';

export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isPending) return;

    setSubmitError(null);
    setIsPending(true);

    try {
      const supabase = createClient();
      // 現在のセッションを終了する。Cookie の更新は SDK に任せる。
      const { error } = await supabase.auth.signOut({ scope: 'local' });

      if (error) throw error;

      // ログアウト後の Cookie をサーバー側の画面にも反映する。
      router.replace('/login');
      router.refresh();
    } catch {
      setSubmitError(
        'ログアウトできませんでした。時間をおいて再度お試しください。',
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuItem
          variant="destructive"
          onClick={handleLogout}
          closeOnClick={false}
          disabled={isPending}
          aria-busy={isPending}
        >
          <LogOut aria-hidden="true" className="size-4" />
          {isPending ? 'ログアウト中…' : 'ログアウト'}
        </DropdownMenuItem>
      </DropdownMenuContent>
      {submitError && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
