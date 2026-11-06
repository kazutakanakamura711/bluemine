'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import {
  taskFormSchema,
  type TaskFormValues,
} from '@/features/tasks/schema/task-form';
import { TaskPriority } from '@/features/tasks/types/task-priority';
import { TaskStatus } from '@/features/tasks/types/task-status';
import { toDateOnlyString } from '@/lib/format-date';
import { createTask, CreateTaskRequestError } from './create-task';

// 作成フォームの入力管理と保存処理を担当し、表示コンポーネントへ状態とハンドラーを渡す。
export function useCreateTaskForm(projectId: string, disabled: boolean) {
  const router = useRouter();
  const tasksPath = `/projects/${encodeURIComponent(projectId)}/tasks`;
  // 保存失敗のメッセージ。フォーム全体のエラー表示に使い、再送信時に消す。
  const [submitError, setSubmitError] = useState<string | null>(null);
  // APIの応答待ち。重複した検証でisSubmittingが先にfalseになっても、操作を無効に保つ。
  const [isSaving, setIsSaving] = useState(false);
  // 作成成功を記録し、詳細画面への遷移が完了するまで再送信を防ぐ。
  const [hasCreated, setHasCreated] = useState(false);
  // 再描画前に複数の検証が完了しても、POSTは1回だけにする。
  const submitLock = useRef(false);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      title: '',
      description: '',
      status: TaskStatus.Todo,
      priority: TaskPriority.Normal,
      assigneeId: '',
      startDate: null,
      dueDate: null,
    },
  });
  // 重複分の検証が先に終わっても、実際のAPI保存中と成功後の移動待ちは操作を止める。
  const isBusy = isSubmitting || isSaving || hasCreated;

  const onSubmit = async (values: TaskFormValues) => {
    if (disabled || submitLock.current) return;
    submitLock.current = true;
    setIsSaving(true);
    setSubmitError(null);

    // APIの7項目だけを渡し、空欄はnull、日付は時刻のない年月日に揃える。
    const task = await createTask(projectId, {
      title: values.title,
      description: values.description || null,
      status: values.status,
      priority: values.priority,
      assigneeId: values.assigneeId || null,
      startDate: values.startDate ? toDateOnlyString(values.startDate) : null,
      dueDate: values.dueDate ? toDateOnlyString(values.dueDate) : null,
    }).catch((error: unknown) => {
      submitLock.current = false;
      setIsSaving(false);
      setSubmitError(
        error instanceof CreateTaskRequestError
          ? error.message
          : 'タスクの作成に失敗しました。時間をおいて、もう一度お試しください。',
      );
      return null;
    });
    // 保存に失敗した場合は、成功後の画面遷移へ進まない。
    if (!task) return;

    // 保存成功後の移動をAPIの失敗処理と分け、移動が終わるまでは再送信を許可しない。
    setHasCreated(true);
    setIsSaving(false);
    router.push(`${tasksPath}/${encodeURIComponent(task.id)}`);
    router.refresh();
  };

  return {
    register,
    handleSubmit,
    control,
    errors,
    isBusy,
    isDisabled: disabled || isBusy,
    hasCreated,
    submitError,
    tasksPath,
    onSubmit,
  };
}
