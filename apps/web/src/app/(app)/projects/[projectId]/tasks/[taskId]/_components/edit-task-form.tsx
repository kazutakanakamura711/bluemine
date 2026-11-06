'use client';

import { useEffect, type ReactNode } from 'react';
import { Controller } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TaskDateInput } from '@/features/tasks/components/task-date-input';
import type { Task } from '@/features/tasks/types/task';
import {
  TaskPriority,
  TaskPriorityDisplayText,
} from '@/features/tasks/types/task-priority';
import {
  TaskStatus,
  TaskStatusDisplayText,
} from '@/features/tasks/types/task-status';
import { useEditTaskForm } from '../_lib/use-edit-task-form';

type EditTaskFormProps = {
  task: Task;
  assignees?: { id: string; name: string | null }[];
  onCancel: () => void;
  onSuccess: () => void;
  onBusyChange: (isBusy: boolean) => void;
  disabled?: boolean;
};

// itemsにも表示名を渡し、ポップアップを開く前から日本語で表示する。
const statusItems = Object.values(TaskStatus).map((value) => ({
  value,
  label: TaskStatusDisplayText[value],
}));
const priorityItems = Object.values(TaskPriority).map((value) => ({
  value,
  label: TaskPriorityDisplayText[value],
}));

function FieldLabel({
  htmlFor,
  required = false,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="gap-0.5 text-xs font-normal leading-4 text-slate-700"
    >
      {children}
      {required && (
        <span aria-hidden="true" className="text-red-500">
          *
        </span>
      )}
    </Label>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

export function EditTaskForm({
  task,
  assignees = [],
  onCancel,
  disabled = false,
  onSuccess,
  onBusyChange,
}: EditTaskFormProps) {
  const {
    register,
    handleSubmit,
    control,
    errors,
    isBusy,
    isDisabled,
    submitError,
    onSubmit,
  } = useEditTaskForm(task, disabled, onSuccess);
  // フォーム外にあるSheetの閉じる操作にも、検証・保存中の状態を伝える。
  useEffect(() => {
    onBusyChange(isBusy);
  }, [isBusy, onBusyChange]);
  // 候補から外れた担当者も、初期表示を勝手に未担当へ置き換えない。
  const displayedAssignees =
    task.assignee && !assignees.some(({ id }) => id === task.assignee?.id)
      ? [task.assignee, ...assignees]
      : assignees;
  const assigneeItems = [
    { value: '', label: '未担当' },
    ...displayedAssignees.map((assignee) => ({
      value: assignee.id,
      label: assignee.name?.trim() || '名前未設定',
    })),
  ];
  const inputClassName =
    'h-10 rounded-sm border-gray-300 px-3 text-sm shadow-none sm:h-8 sm:text-xs';
  const selectClassName =
    'w-full min-w-0 rounded-sm border-gray-300 bg-background px-3 text-sm text-slate-800 data-[size=default]:h-10 sm:text-xs sm:data-[size=default]:h-8';

  return (
    <form
      noValidate
      aria-label="タスク編集フォーム"
      aria-busy={isBusy}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="edit-task-title" required>
            タイトル
          </FieldLabel>
          <Input
            id="edit-task-title"
            {...register('title')}
            disabled={isDisabled}
            aria-required="true"
            aria-invalid={Boolean(errors.title)}
            aria-describedby={
              errors.title ? 'edit-task-title-error' : undefined
            }
            className={inputClassName}
          />
          <FieldError
            id="edit-task-title-error"
            message={errors.title?.message}
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="edit-task-description">説明</FieldLabel>
          <Textarea
            id="edit-task-description"
            {...register('description')}
            disabled={isDisabled}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={
              errors.description ? 'edit-task-description-error' : undefined
            }
            className="field-sizing-fixed h-40 resize-none rounded-sm border-gray-300 px-3 py-2 text-sm leading-6 shadow-none sm:h-32 sm:text-xs sm:leading-5"
          />
          <FieldError
            id="edit-task-description-error"
            message={errors.description?.message}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="edit-task-status" required>
              ステータス
            </FieldLabel>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select
                  name={field.name}
                  items={statusItems}
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                  }}
                  disabled={isDisabled}
                >
                  <SelectTrigger
                    id="edit-task-status"
                    ref={field.ref}
                    onBlur={field.onBlur}
                    aria-required="true"
                    aria-invalid={Boolean(errors.status)}
                    aria-describedby={
                      errors.status ? 'edit-task-status-error' : undefined
                    }
                    className={selectClassName}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {statusItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError
              id="edit-task-status-error"
              message={errors.status?.message}
            />
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="edit-task-priority" required>
              優先度
            </FieldLabel>
            <Controller
              name="priority"
              control={control}
              render={({ field }) => (
                <Select
                  name={field.name}
                  items={priorityItems}
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value);
                  }}
                  disabled={isDisabled}
                >
                  <SelectTrigger
                    id="edit-task-priority"
                    ref={field.ref}
                    onBlur={field.onBlur}
                    aria-required="true"
                    aria-invalid={Boolean(errors.priority)}
                    aria-describedby={
                      errors.priority ? 'edit-task-priority-error' : undefined
                    }
                    className={selectClassName}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    {priorityItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError
              id="edit-task-priority-error"
              message={errors.priority?.message}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel htmlFor="edit-task-assignee">担当者</FieldLabel>
          <Controller
            name="assigneeId"
            control={control}
            render={({ field }) => (
              <Select
                name={field.name}
                items={assigneeItems}
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value ?? '');
                }}
                disabled={isDisabled}
              >
                <SelectTrigger
                  id="edit-task-assignee"
                  ref={field.ref}
                  onBlur={field.onBlur}
                  aria-invalid={Boolean(errors.assigneeId)}
                  aria-describedby={
                    errors.assigneeId ? 'edit-task-assignee-error' : undefined
                  }
                  className={selectClassName}
                >
                  <SelectValue className="min-w-0 truncate" />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  {assigneeItems.map((item) => (
                    <SelectItem
                      key={item.value}
                      value={item.value}
                      className="items-start [&>div:first-child]:min-w-0 [&>div:first-child]:shrink [&>div:first-child]:whitespace-normal [&>div:first-child]:wrap-anywhere"
                    >
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError
            id="edit-task-assignee-error"
            message={errors.assigneeId?.message}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-4">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="edit-task-start-date">開始日</FieldLabel>
            <Controller
              name="startDate"
              control={control}
              rules={{ deps: ['dueDate'] }}
              render={({ field }) => (
                <TaskDateInput
                  {...field}
                  id="edit-task-start-date"
                  label="開始日"
                  onChange={(value) => {
                    field.onChange(value);
                  }}
                  disabled={isDisabled}
                  aria-invalid={Boolean(errors.startDate)}
                  aria-describedby={
                    errors.startDate ? 'edit-task-start-date-error' : undefined
                  }
                  className={inputClassName}
                />
              )}
            />
            <FieldError
              id="edit-task-start-date-error"
              message={errors.startDate?.message}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel htmlFor="edit-task-due-date">期限</FieldLabel>
            <Controller
              name="dueDate"
              control={control}
              render={({ field }) => (
                <TaskDateInput
                  {...field}
                  id="edit-task-due-date"
                  label="期限"
                  onChange={(value) => {
                    field.onChange(value);
                  }}
                  disabled={isDisabled}
                  aria-invalid={Boolean(errors.dueDate)}
                  aria-describedby={
                    errors.dueDate ? 'edit-task-due-date-error' : undefined
                  }
                  className={inputClassName}
                />
              )}
            />
            <FieldError
              id="edit-task-due-date-error"
              message={errors.dueDate?.message}
            />
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {submitError && (
          <p role="alert" className="text-xs leading-5 text-destructive">
            {submitError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-start">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isBusy}
            className="h-9 rounded-sm bg-slate-100 px-3 text-xs text-slate-700 sm:h-8"
          >
            キャンセル
          </Button>
          <Button
            type="submit"
            disabled={isDisabled}
            className="h-9 rounded-sm bg-indigo-600 px-3 text-xs text-white sm:h-8"
          >
            変更を保存
          </Button>
        </div>
      </div>
    </form>
  );
}
