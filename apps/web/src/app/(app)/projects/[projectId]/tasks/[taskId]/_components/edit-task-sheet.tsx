'use client';

import { useState } from 'react';
import { SquarePen, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { Task } from '@/features/tasks/types/task';
import { EditTaskForm } from './edit-task-form';

type EditTaskSheetProps = {
  task: Task;
  assignees?: { id: string; name: string | null }[];
  disabled?: boolean;
};

export function EditTaskSheet({
  task,
  assignees = [],
  disabled = false,
}: EditTaskSheetProps) {
  // シートの開閉を管理する。
  const [isOpen, setIsOpen] = useState(false);
  // フォームの処理中は、Sheetを閉じて入力や送信ロックが破棄されるのを防ぐ。
  const [isBusy, setIsBusy] = useState(false);

  const handleCancel = () => {
    if (isBusy) return;
    setIsOpen(false);
  };

  const handleSuccess = () => {
    // 保存成功による閉じる処理は許可し、次に開くときのために状態を戻す。
    setIsBusy(false);
    setIsOpen(false);
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open, eventDetails) => {
        if (!open && isBusy) {
          eventDetails.cancel();
          return;
        }
        setIsOpen(open);
      }}
    >
      <SheetTrigger
        disabled={disabled || isBusy}
        render={
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-sm border-gray-300 px-3 text-xs text-slate-700 shadow-none"
          />
        }
      >
        <SquarePen aria-hidden="true" className="size-3.5" />
        編集
      </SheetTrigger>

      <SheetContent
        side="right"
        showCloseButton={false}
        overlayClassName="bg-black/25 supports-backdrop-filter:backdrop-blur-none"
        className="min-h-0 gap-0 overflow-hidden bg-background p-0 data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:sm:w-lg data-[side=right]:sm:max-w-full"
      >
        <SheetHeader className="min-h-14 shrink-0 flex-row items-center justify-between gap-3 border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-semibold">
            タスクを編集
          </SheetTitle>
          <SheetDescription className="sr-only">
            タスクの基本情報、属性、日程。
          </SheetDescription>
          <SheetClose
            aria-label="タスク編集を閉じる"
            disabled={isBusy}
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-sm text-slate-400"
              />
            }
          >
            <X aria-hidden="true" className="size-4" />
          </SheetClose>
        </SheetHeader>

        {/* 閉じた時点でフォームを破棄し、再表示時は最新のTaskから入力とエラーを初期化する。 */}
        {isOpen && (
          <EditTaskForm
            key={task.id}
            task={task}
            assignees={assignees}
            disabled={disabled}
            onCancel={handleCancel}
            onSuccess={handleSuccess}
            onBusyChange={setIsBusy}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
