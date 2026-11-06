// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { TaskPriority } from '@/features/tasks/types/task-priority';
import { TaskStatus } from '@/features/tasks/types/task-status';
import { taskFormSchema, type TaskFormValues } from './task-form';

const validValues: TaskFormValues = {
  title: 'ログイン画面を作る',
  description: '',
  status: TaskStatus.Todo,
  priority: TaskPriority.Normal,
  assigneeId: '',
  startDate: null,
  dueDate: null,
};

describe('taskFormSchema（作成・編集で共通）', () => {
  it.each(['', ' \n\t　', 'あ'.repeat(201)])(
    '空・空白だけ・201文字のタイトルを拒否する',
    (title) => {
      const result = taskFormSchema.safeParse({ ...validValues, title });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues[0].path).toEqual(['title']);
    },
  );

  it('タイトルと説明の前後の空白を除き、上限の200文字・5,000文字を許可する', () => {
    const result = taskFormSchema.parse({
      ...validValues,
      title: `  ${'あ'.repeat(200)}  `,
      description: `  ${'い'.repeat(5000)}  `,
    });
    expect(result.title).toHaveLength(200);
    expect(result.description).toHaveLength(5000);
  });

  it.each(['😀', '☀️'])(
    '絵文字%sの文字数もBackendと揃え、200文字を許可して201文字を拒否する',
    (character) => {
      expect(
        taskFormSchema.safeParse({
          ...validValues,
          title: character.repeat(200),
          description: character.repeat(5000),
        }).success,
      ).toBe(true);
      expect(
        taskFormSchema.safeParse({
          ...validValues,
          title: character.repeat(201),
        }).success,
      ).toBe(false);
      expect(
        taskFormSchema.safeParse({
          ...validValues,
          description: character.repeat(5001),
        }).success,
      ).toBe(false);
    },
  );

  it('説明の空欄・空白だけを許可する', () => {
    expect(
      taskFormSchema.parse({ ...validValues, description: ' \n　' })
        .description,
    ).toBe('');
  });

  it('5,001文字の説明を拒否する', () => {
    expect(
      taskFormSchema.safeParse({
        ...validValues,
        description: 'あ'.repeat(5001),
      }).success,
    ).toBe(false);
  });

  it.each([
    { field: 'status', value: '' },
    { field: 'status', value: null },
    { field: 'priority', value: 'urgent' },
    { field: 'priority', value: null },
  ])('未選択・定義外の$fieldを拒否する', ({ field, value }) => {
    const result = taskFormSchema.safeParse({
      ...validValues,
      [field]: value,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual([field]);
  });

  it.each([
    { startDate: null, dueDate: null },
    { startDate: new Date(2026, 9, 15), dueDate: null },
    { startDate: null, dueDate: new Date(2026, 9, 15) },
    { startDate: new Date(2026, 9, 15), dueDate: new Date(2026, 9, 15) },
    { startDate: new Date(2026, 9, 15), dueDate: new Date(2026, 10, 1) },
    { startDate: new Date(2026, 9, 15, 23), dueDate: new Date(2026, 9, 15, 1) },
  ])('日付の未設定・片方だけ・同日・期限が後の日を許可する', (dates) => {
    expect(taskFormSchema.safeParse({ ...validValues, ...dates }).success).toBe(
      true,
    );
  });

  it('開始日より前の期限を、期限欄のエラーとして返す', () => {
    const result = taskFormSchema.safeParse({
      ...validValues,
      startDate: new Date(2026, 9, 15),
      dueDate: new Date(2026, 9, 14),
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ['dueDate'],
          message: '期限は開始日以降の日付を指定してください',
        }),
      ]);
  });

  it.each([
    new Date('invalid'),
    new Date('0000-01-01T12:00:00'),
    new Date('+010000-01-01T12:00:00'),
  ])('無効な日付・APIの範囲外の年を拒否する', (startDate) => {
    expect(
      taskFormSchema.safeParse({ ...validValues, startDate }).success,
    ).toBe(false);
  });

  it.each([new Date('0001-01-01T12:00:00'), new Date('9999-12-31T12:00:00')])(
    'APIの年の下限・上限を許可する',
    (startDate) => {
      expect(
        taskFormSchema.safeParse({ ...validValues, startDate }).success,
      ).toBe(true);
    },
  );
});
