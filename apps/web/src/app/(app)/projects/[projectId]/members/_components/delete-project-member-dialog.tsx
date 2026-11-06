import { X } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

type DeleteProjectMemberDialogProps = {
  isOpen: boolean;
  memberName: string | null;
  memberEmail: string;
  isDeleting: boolean;
  deleteError: string | null;
  onClose: (open: boolean) => void;
  onDelete: () => void;
};

// 確認画面の表示を担当し、開閉状態は呼び出し元から受け取る。
export function DeleteProjectMemberDialog({
  isOpen,
  memberName,
  memberEmail,
  isDeleting,
  deleteError,
  onClose,
  onDelete,
}: DeleteProjectMemberDialogProps) {
  const displayName = memberName?.trim() || '名前未設定';

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent
        size="lg"
        aria-busy={isDeleting}
        className="top-auto bottom-3 max-h-[calc(100dvh-1.5rem)] translate-y-0 gap-0 overflow-y-auto rounded p-0 data-[size=lg]:max-w-[calc(100%-1.5rem)] sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 data-[size=lg]:sm:max-w-120"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-popover px-4 py-3 sm:px-5 sm:py-4">
          <AlertDialogTitle className="text-sm leading-6 font-semibold">
            メンバーを削除
          </AlertDialogTitle>
          <AlertDialogCancel
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="閉じる"
            disabled={isDeleting}
            className="size-6 text-muted-foreground"
          >
            <X aria-hidden="true" className="size-4" />
          </AlertDialogCancel>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <AlertDialogDescription className="text-sm leading-relaxed wrap-anywhere">
            {displayName}（{memberEmail}）をプロジェクトから削除します。
            <span className="mt-1 block">
              ユーザーアカウントは削除されません。
            </span>
          </AlertDialogDescription>

          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription className="wrap-anywhere">
                {deleteError}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button
              type="button"
              disabled={isDeleting}
              onClick={onDelete}
              className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto"
            >
              {isDeleting ? '削除中...' : '削除'}
            </Button>
            <AlertDialogCancel
              type="button"
              variant="secondary"
              disabled={isDeleting}
              className="w-full sm:w-auto"
            >
              キャンセル
            </AlertDialogCancel>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
