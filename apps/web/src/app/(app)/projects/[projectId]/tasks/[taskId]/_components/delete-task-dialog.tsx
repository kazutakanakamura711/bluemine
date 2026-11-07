'use client';

import { useRef } from 'react';
import { Trash2, X } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useDeleteTaskDialog } from '../_lib/use-delete-task-dialog';

type DeleteTaskDialogProps = {
  projectId: string;
  taskId: string;
  taskNumber: string;
  taskTitle: string;
};

export function DeleteTaskDialog({
  projectId,
  taskId,
  taskNumber,
  taskTitle,
}: DeleteTaskDialogProps) {
  const { isOpen, isDeleting, deleteError, handleOpenChange, handleDelete } =
    useDeleteTaskDialog({ projectId, taskId });
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open, eventDetails) => {
        // 削除は閉じても中断できないため、送信中はEscapeでも閉じない。
        if (!handleOpenChange(open)) eventDetails.cancel();
      }}
    >
      <AlertDialogTrigger
        disabled={isDeleting}
        render={
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-sm border-gray-300 px-3 text-xs text-slate-700 shadow-none"
          />
        }
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
        削除
      </AlertDialogTrigger>
      <AlertDialogContent
        size="lg"
        initialFocus={cancelRef}
        aria-busy={isDeleting}
        className="top-auto bottom-3 max-h-[calc(100dvh-1.5rem)] translate-y-0 gap-0 overflow-y-auto rounded p-0 data-[size=lg]:max-w-[calc(100%-1.5rem)] sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 data-[size=lg]:sm:max-w-108"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-popover px-4 py-3 sm:px-5 sm:py-4">
          <AlertDialogTitle className="text-sm leading-6 font-semibold">
            タスクを削除
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
            {taskNumber}「{taskTitle}」を削除します。この操作は元に戻せません。
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
              onClick={handleDelete}
              className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto"
            >
              {isDeleting ? '削除中...' : '削除'}
            </Button>
            <AlertDialogCancel
              ref={cancelRef}
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
