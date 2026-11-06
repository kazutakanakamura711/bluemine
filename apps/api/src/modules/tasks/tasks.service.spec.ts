import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectMemberRole } from '../../generated/prisma/enums.js';
import type { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

type UpdateInput = Parameters<TasksService['update']>[2];

describe('TasksService.update', () => {
  const projectId = 'project-id';
  const taskId = 'task-id';
  const userId = 'actor-id';
  const repository = {
    findProjectMember: vi.fn<TasksRepository['findProjectMember']>(),
    update: vi.fn<TasksRepository['update']>(),
  };
  const service = new TasksService(repository as unknown as TasksRepository);
  const member = {
    id: 'membership-id',
    projectId,
    userId,
    role: ProjectMemberRole.member,
    createdAt: new Date('2026-10-31T00:00:00.000Z'),
    updatedAt: new Date('2026-10-31T00:00:00.000Z'),
  };
  const task: NonNullable<Awaited<ReturnType<TasksRepository['findById']>>> = {
    id: taskId,
    projectId,
    number: 7,
    reporterId: 'reporter-id',
    assigneeId: null,
    title: 'Task title',
    description: null,
    status: 'todo',
    priority: 'normal',
    startDate: null,
    dueDate: null,
    assignee: null,
    reporter: { id: 'reporter-id', name: null },
    createdAt: new Date('2026-10-31T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    repository.findProjectMember.mockResolvedValue(member);
    repository.update.mockResolvedValue({ status: 'updated', task });
  });

  function update(dto: UpdateInput) {
    return service.update(projectId, taskId, dto, userId);
  }

  it.each([ProjectMemberRole.owner, ProjectMemberRole.member])(
    '%sは更新でき、文字列と日付を正規化して認証済み本人のIDを渡す',
    async (role) => {
      repository.findProjectMember.mockResolvedValue({ ...member, role });
      await expect(
        update({
          title: '  Task title  ',
          description: '  Task description  ',
          status: 'in_progress',
          priority: 'high',
          assigneeId: 'assignee-id',
          startDate: '2026-11-10',
          dueDate: '2026-11-10',
        }),
      ).resolves.toBe(task);
      expect(repository.findProjectMember).toHaveBeenCalledWith(
        projectId,
        userId,
      );
      expect(repository.update).toHaveBeenCalledExactlyOnceWith({
        projectId,
        taskId,
        userId,
        title: 'Task title',
        description: 'Task description',
        status: 'in_progress',
        priority: 'high',
        assigneeId: 'assignee-id',
        startDate: new Date('2026-11-10T00:00:00.000Z'),
        dueDate: new Date('2026-11-10T00:00:00.000Z'),
      });
    },
  );

  it('省略・undefinedの項目と、番号・報告者などの余分な項目を渡さない', async () => {
    const input = {
      title: '  Title only  ',
      description: undefined,
      status: undefined,
      priority: undefined,
      assigneeId: undefined,
      startDate: undefined,
      dueDate: undefined,
      projectId: 'other-project',
      userId: 'other-user',
      number: 99,
      reporterId: 'other-reporter',
    };
    await update(input);
    expect(repository.update).toHaveBeenCalledExactlyOnceWith({
      projectId,
      taskId,
      userId,
      title: 'Title only',
    });
  });

  it.each([null, '', '   '])(
    '説明の%sはnullへ正規化し、解除指定を省略しない',
    async (description) => {
      await update({
        description,
        assigneeId: null,
        startDate: null,
        dueDate: null,
      });
      expect(repository.update).toHaveBeenCalledExactlyOnceWith({
        projectId,
        taskId,
        userId,
        description: null,
        assigneeId: null,
        startDate: null,
        dueDate: null,
      });
    },
  );

  it.each([
    ['description', { description: null }],
    ['assigneeId', { assigneeId: null }],
    ['startDate', { startDate: null }],
    ['dueDate', { dueDate: null }],
  ] as const)('%sの解除だけでも更新項目として扱う', async (_field, input) => {
    await expect(update(input)).resolves.toBe(task);
    expect(repository.update).toHaveBeenCalledExactlyOnceWith({
      projectId,
      taskId,
      userId,
      ...input,
    });
  });

  it.each([
    {},
    {
      title: undefined,
      description: undefined,
      status: undefined,
      priority: undefined,
      assigneeId: undefined,
      startDate: undefined,
      dueDate: undefined,
    },
  ])('更新項目がなければ400にし、保存しない（%j）', async (input) => {
    const result = update(input);
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow('更新する項目を指定してください');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('本人の参加情報がなければ404にし、保存しない', async () => {
    repository.findProjectMember.mockResolvedValue(null);
    const result = update({ title: 'Rejected' });
    await expect(result).rejects.toBeInstanceOf(NotFoundException);
    await expect(result).rejects.toThrow('プロジェクトが見つかりません');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('viewerなら更新内容を調べる前に403にし、保存しない', async () => {
    repository.findProjectMember.mockResolvedValue({
      ...member,
      role: ProjectMemberRole.viewer,
    });
    const result = update({});
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(result).rejects.toThrow('タスクを更新する権限がありません');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('指定された期限が開始日より前なら400にし、保存しない', async () => {
    const result = update({ startDate: '2026-11-11', dueDate: '2026-11-10' });
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow(
      '期限は開始日以降の日付を指定してください',
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each([
    {
      input: { startDate: '2026-11-10' },
      expected: { startDate: new Date('2026-11-10T00:00:00.000Z') },
    },
    {
      input: { dueDate: '2026-11-20' },
      expected: { dueDate: new Date('2026-11-20T00:00:00.000Z') },
    },
    {
      input: { startDate: null, dueDate: '2026-11-01' },
      expected: {
        startDate: null,
        dueDate: new Date('2026-11-01T00:00:00.000Z'),
      },
    },
    {
      input: { startDate: '2026-11-30', dueDate: null },
      expected: {
        startDate: new Date('2026-11-30T00:00:00.000Z'),
        dueDate: null,
      },
    },
  ])(
    '片方だけの日付や解除は、指定内容を維持してRepositoryへ渡す（%j）',
    async ({ input, expected }) => {
      await expect(update(input)).resolves.toBe(task);
      expect(repository.update).toHaveBeenCalledExactlyOnceWith({
        projectId,
        taskId,
        userId,
        ...expected,
      });
    },
  );

  it.each([
    ['project_not_found', NotFoundException, 'プロジェクトが見つかりません'],
    ['forbidden', ForbiddenException, 'タスクを更新する権限がありません'],
    [
      'project_archived',
      ConflictException,
      'アーカイブ済みのプロジェクトにはタスクを更新できません',
    ],
    ['task_not_found', NotFoundException, 'タスクが見つかりません'],
    [
      'assignee_not_found',
      BadRequestException,
      '担当者は同じプロジェクトの参加者を指定してください',
    ],
    [
      'invalid_date_range',
      BadRequestException,
      '期限は開始日以降の日付を指定してください',
    ],
  ] as const)(
    '保存時の%sを対応するHTTP例外へ変換する',
    async (status, exception, message) => {
      repository.update.mockResolvedValue({ status });
      const result = update({ dueDate: '2026-11-20' });
      await expect(result).rejects.toBeInstanceOf(exception);
      await expect(result).rejects.toThrow(message);
    },
  );

  it('同じ値によるunchangedでも、Repositoryが返したTaskを返す', async () => {
    repository.update.mockResolvedValue({ status: 'unchanged', task });
    await expect(update({ title: task.title })).resolves.toBe(task);
  });

  it('保存時の予期しない例外を別の業務エラーに置き換えない', async () => {
    const failure = new Error('Database unavailable');
    repository.update.mockRejectedValue(failure);
    await expect(update({ title: 'Task' })).rejects.toBe(failure);
  });
});
