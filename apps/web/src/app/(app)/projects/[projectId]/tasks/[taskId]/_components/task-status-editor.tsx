'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { TaskStatusBadge } from '@/features/tasks/components/task-badges';
import { toast } from '@/components/ui/toast';
import {
  TaskStatus,
  TaskStatusDisplayText,
} from '@/features/tasks/types/task-status';
import { updateTask, UpdateTaskRequestError } from '../_lib/update-task';

type TaskStatusEditorProps = {
  projectId: string;
  taskId: string;
  status: TaskStatus;
  updatedAt: string;
};

// itemsにも表示名を渡し、ポップアップを開く前から日本語で表示する。
const statusItems = Object.values(TaskStatus).map((value) => ({
  value,
  label: TaskStatusDisplayText[value],
}));

export function TaskStatusEditor({
  projectId,
  taskId,
  status,
  updatedAt,
}: TaskStatusEditorProps) {
  const router = useRouter();
  // 保存APIが返したTaskのステータスと更新日時。再取得データが届くまでは、より新しい保存結果を表示する。
  const [savedTask, setSavedTask] = useState<{
    taskId: string;
    status: TaskStatus;
    updatedAt: string;
  } | null>(null);
  // APIの保存処理中かどうか。保存中の表示と選択欄の無効化に使う。
  const [isSaving, setIsSaving] = useState(false);
  // ステータスのプルダウンが開いているかどうかを管理する。
  const [isOpen, setIsOpen] = useState(false);
  // APIに失敗したときのメッセージ。選択欄の下に表示する。
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 再描画前の連続操作でも、保存APIを重複して呼ばないためのロック。
  const saveLock = useRef(false);
  // 再取得が届く前は、APIから返った新しい値を表示する。
  const displayedStatus =
    savedTask?.taskId === taskId &&
    Date.parse(savedTask.updatedAt) > Date.parse(updatedAt)
      ? savedTask.status
      : status;

  // 選択されたステータスを保存し、成功・失敗に応じて画面の状態を更新する。
  // 値なしを示すnullは保存しない。この画面にはnullの選択肢がないため通常は発生しない。
  async function handleStatusChange(selectedStatus: TaskStatus | null) {
    if (selectedStatus === null || saveLock.current || isSaving) return;
    setIsOpen(false);
    setSubmitError(null);
    if (selectedStatus === displayedStatus) return;

    saveLock.current = true;
    setIsSaving(true);
    const updatedTask = await updateTask(projectId, taskId, {
      status: selectedStatus,
    }).catch((error: unknown) => {
      setSubmitError(
        error instanceof UpdateTaskRequestError
          ? error.message
          : 'タスクの更新に失敗しました。時間をおいて、もう一度お試しください。',
      );
      saveLock.current = false;
      setIsSaving(false);
      return null;
    });
    if (updatedTask === null) return;

    setSavedTask({
      taskId,
      status: updatedTask.status,
      updatedAt: updatedTask.updatedAt,
    });
    router.refresh();
    toast.add({
      type: 'success',
      title: `ステータスを「${TaskStatusDisplayText[updatedTask.status]}」に変更しました`,
    });
    saveLock.current = false;
    setIsSaving(false);
  }

  return (
    <div>
      <Select
        value={displayedStatus}
        items={statusItems}
        open={isOpen}
        onOpenChange={setIsOpen}
        onValueChange={handleStatusChange}
        disabled={isSaving}
      >
        <SelectTrigger
          aria-label="ステータス"
          className="h-auto gap-1 border-0 p-0 shadow-none data-[size=default]:h-auto"
        >
          <TaskStatusBadge status={displayedStatus} />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {statusItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isSaving && (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          保存中...
        </p>
      )}
      {submitError && (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {submitError}
        </p>
      )}
    </div>
  );
}
