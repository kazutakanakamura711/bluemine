'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import {
  taskFormSchema,
  type TaskFormValues,
} from '@/features/tasks/schema/task-form';
import type { Task } from '@/features/tasks/types/task';
import { parseDateOnly, toDateOnlyString } from '@/lib/format-date';
import {
  updateTask,
  UpdateTaskRequestError,
  type UpdateTaskInput,
} from './update-task';

// 編集フォームの入力管理と保存処理を担当し、表示コンポーネントへ状態とハンドラーを渡す。
export function useEditTaskForm(
  task: Task,
  disabled: boolean,
  onSuccess: () => void,
) {
  const router = useRouter();
  // 保存失敗のメッセージ。フォーム全体のエラー表示に使い、再送信時に消す。
  const [submitError, setSubmitError] = useState<string | null>(null);
  // APIの応答待ち。重複した検証でisSubmittingが先にfalseになっても、操作を無効に保つ。
  const [isSaving, setIsSaving] = useState(false);
  // 保存成功を記録し、Sheetが閉じてフォームが破棄されるまで再送信を防ぐ。
  const [hasUpdated, setHasUpdated] = useState(false);
  // 再描画前に複数の検証が完了しても、PATCHは1回だけにする。
  const submitLock = useRef(false);
  const {
    register,
    handleSubmit,
    control,
    // dirtyFieldsは、defaultValuesと比べて変更された項目をtrueで持つ。
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      assigneeId: task.assignee?.id ?? '',
      // APIの日付を時刻のない年月日として読み込み、タイムゾーンによる日付ずれを避ける。
      startDate: task.startDate ? parseDateOnly(task.startDate) : null,
      dueDate: task.dueDate ? parseDateOnly(task.dueDate) : null,
    },
  });
  // 重複分の検証が先に終わっても、保存中と成功後にSheetが閉じるまでは操作を止める。
  const isBusy = isSubmitting || isSaving || hasUpdated;

  const onSubmit = async (values: TaskFormValues) => {
    if (disabled || submitLock.current) return;

    // 未変更の項目は省略し、他の操作で保存された最新値を上書きしない。
    // 変更した項目を空欄にした場合だけ、nullで設定を解除する。
    const input: UpdateTaskInput = {};
    if (dirtyFields.title) input.title = values.title;
    if (dirtyFields.description) input.description = values.description || null;
    if (dirtyFields.status) input.status = values.status;
    if (dirtyFields.priority) input.priority = values.priority;
    if (dirtyFields.assigneeId) input.assigneeId = values.assigneeId || null;
    if (dirtyFields.startDate) {
      input.startDate = values.startDate
        ? toDateOnlyString(values.startDate)
        : null;
    }
    if (dirtyFields.dueDate) {
      input.dueDate = values.dueDate ? toDateOnlyString(values.dueDate) : null;
    }

    // 空のPATCHはAPIが拒否するため、変更がなければ送信しない。
    if (Object.keys(input).length === 0) return;

    submitLock.current = true;
    setIsSaving(true);
    setSubmitError(null);

    try {
      await updateTask(task.projectId, task.id, input);
    } catch (error) {
      submitLock.current = false;
      setIsSaving(false);
      setSubmitError(
        error instanceof UpdateTaskRequestError
          ? error.message
          : 'タスクの更新に失敗しました。時間をおいて、もう一度お試しください。',
      );
      return;
    }

    // Sheetを閉じる処理をAPIの失敗処理と分け、詳細画面のデータを再取得する。
    setHasUpdated(true);
    setIsSaving(false);
    onSuccess();
    router.refresh();
  };

  return {
    register,
    handleSubmit,
    control,
    errors,
    isBusy,
    isDisabled: disabled || isBusy,
    hasUpdated,
    submitError,
    onSubmit,
  };
}
