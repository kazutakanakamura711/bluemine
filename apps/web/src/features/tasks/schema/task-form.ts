import { z } from 'zod';

import { TaskPriority } from '@/features/tasks/types/task-priority';
import { TaskStatus } from '@/features/tasks/types/task-status';
import { isDateOnlyBefore } from '@/lib/format-date';

// BackendのMaxLengthと揃え、絵文字のサロゲートペアや表示形式の指定を二重に数えない。
function characterCount(value: string): number {
  const presentationSequences =
    value.match(/[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g) ?? [];
  return Array.from(value).length - presentationSequences.length;
}

// カレンダーの選択日はDate、未設定はnullで管理する。API用の文字列への変換は送信時に行う。
const taskDateSchema = z
  .date({ error: '有効な日付を選択してください' })
  .refine((date) => date.getFullYear() >= 1 && date.getFullYear() <= 9999, {
    message: '日付は0001年から9999年の範囲で指定してください',
  })
  .nullable();

// Backendの入力ルールに合わせる。参加資格や最新の権限は、保存時にAPIが再確認する。
export const taskFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'タイトルは必須です')
      .refine(
        (value) => characterCount(value) <= 200,
        'タイトルは200文字以内で入力してください',
      ),
    description: z
      .string()
      .trim()
      .refine(
        (value) => characterCount(value) <= 5000,
        '説明は5,000文字以内で入力してください',
      ),
    status: z.enum(TaskStatus, { error: 'ステータスを選択してください' }),
    priority: z.enum(TaskPriority, { error: '優先度を選択してください' }),
    // 未担当は空文字。担当者は、対象Projectの参加者を選択欄に表示する。
    assigneeId: z.string(),
    startDate: taskDateSchema,
    dueDate: taskDateSchema,
  })
  .refine(
    ({ startDate, dueDate }) =>
      !startDate ||
      !dueDate ||
      // 時刻ではなく、画面で選択した年月日で比較する。同日も許可する。
      !isDateOnlyBefore(dueDate, startDate),
    {
      path: ['dueDate'],
      message: '期限は開始日以降の日付を指定してください',
    },
  );

export type TaskFormValues = z.infer<typeof taskFormSchema>;
