'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import type { TaskUser } from '@/features/tasks/types/task';
import { updateTask, UpdateTaskRequestError } from '../_lib/update-task';

type TaskAssigneeEditorProps = {
  projectId: string;
  taskId: string;
  assignee: TaskUser | null;
  assignees: TaskUser[];
  updatedAt: string;
};

export function TaskAssigneeEditor({
  projectId,
  taskId,
  assignee,
  assignees,
  updatedAt,
}: TaskAssigneeEditorProps) {
  const router = useRouter();
  // 保存APIが返した担当者と更新日時。再取得までに新しい結果を表示する。
  const [savedTask, setSavedTask] = useState<{
    taskId: string;
    assignee: TaskUser | null;
    updatedAt: string;
  } | null>(null);
  // APIの保存処理中かどうか。保存中表示と選択欄の無効化に使う。
  const [isSaving, setIsSaving] = useState(false);
  // 担当者のプルダウンが開いているかどうかを管理する。
  const [isOpen, setIsOpen] = useState(false);
  // APIに失敗したときのメッセージ。選択欄の下に表示する。
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 再描画前の連続操作でも、保存APIを重複して呼ばないためのロック。
  const saveLock = useRef(false);

  // 現在の担当者が候補から外れていても、再取得まで表示を保てるように含める。
  const displayedAssignees =
    assignee && !assignees.some(({ id }) => id === assignee.id)
      ? [assignee, ...assignees]
      : assignees;
  // Select用の選択肢の作成。
  const assigneeItems = [
    { value: '', label: '未担当' },
    ...displayedAssignees.map((member) => ({
      value: member.id,
      label: member.name?.trim() || '名前未設定',
    })),
  ];
  // 保存結果と再取得データを比べ、新しい担当者を表示する。
  const displayedAssignee =
    savedTask?.taskId === taskId &&
    Date.parse(savedTask.updatedAt) > Date.parse(updatedAt)
      ? savedTask.assignee
      : assignee;

  async function handleAssigneeChange(selectedAssigneeId: string | null) {
    if (selectedAssigneeId === null || saveLock.current || isSaving) return;

    setIsOpen(false);
    setSubmitError(null);
    const nextAssigneeId = selectedAssigneeId || null;
    if (nextAssigneeId === (displayedAssignee?.id ?? null)) return;

    saveLock.current = true;
    setIsSaving(true);
    const updatedTask = await updateTask(projectId, taskId, {
      assigneeId: nextAssigneeId,
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
      assignee: updatedTask.assignee,
      updatedAt: updatedTask.updatedAt,
    });
    router.refresh();
    toast.add({
      type: 'success',
      title: updatedTask.assignee
        ? `担当者を「${updatedTask.assignee.name?.trim() || '名前未設定'}」に変更しました`
        : '担当者を未担当に変更しました',
    });
    saveLock.current = false;
    setIsSaving(false);
  }

  return (
    <div className="min-w-0">
      <Select
        value={displayedAssignee?.id ?? ''}
        items={assigneeItems}
        open={isOpen}
        onOpenChange={setIsOpen}
        onValueChange={handleAssigneeChange}
        disabled={isSaving}
      >
        <SelectTrigger
          aria-label="担当者"
          className="h-auto max-w-full gap-1 border-0 p-0 text-left text-sm shadow-none data-[size=default]:h-auto"
        >
          <SelectValue className="min-w-0 truncate" />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {assigneeItems.map((item) => (
            <SelectItem
              key={item.value || 'unassigned'}
              value={item.value}
              className="max-w-64 [&>div:first-child]:min-w-0 [&>div:first-child]:whitespace-normal [&>div:first-child]:wrap-anywhere"
            >
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
