import { TasksRepository } from './tasks.repository.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectMemberRole } from '../../generated/prisma/enums.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';

@Injectable()
export class TasksService {
  constructor(private readonly tasksRepository: TasksRepository) {}

  async findAll(projectId: string, userId: string) {
    const projectMember = await this.tasksRepository.findProjectMember(
      projectId,
      userId,
    );

    if (!projectMember) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }

    return await this.tasksRepository.findAll(projectId);
  }

  async findOne(projectId: string, taskId: string, userId: string) {
    const projectMember = await this.tasksRepository.findProjectMember(
      projectId,
      userId,
    );

    if (!projectMember) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }

    const task = await this.tasksRepository.findById(projectId, taskId);

    if (!task) {
      throw new NotFoundException('タスクが見つかりません');
    }

    return task;
  }

  async create(projectId: string, dto: CreateTaskDto, userId: string) {
    const member = await this.tasksRepository.findProjectMember(
      projectId,
      userId,
    );
    if (!member) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }
    if (member.role === ProjectMemberRole.viewer) {
      throw new ForbiddenException('タスクを作成する権限がありません');
    }

    if (dto.startDate && dto.dueDate && dto.dueDate < dto.startDate) {
      throw new BadRequestException('期限は開始日以降の日付を指定してください');
    }

    const result = await this.tasksRepository.create({
      projectId,
      reporterId: userId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      status: dto.status,
      priority: dto.priority,
      assigneeId: dto.assigneeId ?? null,
      startDate: dto.startDate
        ? new Date(`${dto.startDate}T00:00:00.000Z`)
        : null,
      dueDate: dto.dueDate ? new Date(`${dto.dueDate}T00:00:00.000Z`) : null,
    });

    // 保存時の再確認結果をHTTPエラーへ変換する。RepositoryにはHTTPを持ち込まない。
    if (result.status === 'project_not_found') {
      throw new NotFoundException('プロジェクトが見つかりません');
    }
    if (result.status === 'forbidden') {
      throw new ForbiddenException('タスクを作成する権限がありません');
    }
    if (result.status === 'project_archived') {
      throw new ConflictException(
        'アーカイブ済みのプロジェクトにはタスクを作成できません',
      );
    }
    if (result.status === 'assignee_not_found') {
      throw new BadRequestException(
        '担当者は同じプロジェクトの参加者を指定してください',
      );
    }
    if (result.status === 'number_conflict') {
      throw new ConflictException('タスク番号が競合しました');
    }

    return result.task;
  }

  async update(
    projectId: string,
    taskId: string,
    dto: UpdateTaskDto,
    userId: string,
  ) {
    const member = await this.tasksRepository.findProjectMember(
      projectId,
      userId,
    );
    if (!member) {
      throw new NotFoundException('プロジェクトが見つかりません');
    }
    if (member.role === ProjectMemberRole.viewer) {
      throw new ForbiddenException('タスクを更新する権限がありません');
    }

    // nullは解除の指定なので、undefinedだけを「更新項目なし」として扱う。
    if (
      dto.title === undefined &&
      dto.description === undefined &&
      dto.status === undefined &&
      dto.priority === undefined &&
      dto.assigneeId === undefined &&
      dto.startDate === undefined &&
      dto.dueDate === undefined
    ) {
      throw new BadRequestException('更新する項目を指定してください');
    }

    if (dto.startDate && dto.dueDate && dto.dueDate < dto.startDate) {
      throw new BadRequestException('期限は開始日以降の日付を指定してください');
    }

    const result = await this.tasksRepository.update({
      projectId,
      taskId,
      userId,
      // 省略とnullを区別し、指定された項目だけを正規化して渡す。
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.description !== undefined && {
        description: dto.description?.trim() || null,
      }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
      ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
      ...(dto.startDate !== undefined && {
        startDate:
          dto.startDate === null
            ? null
            : new Date(`${dto.startDate}T00:00:00.000Z`),
      }),
      ...(dto.dueDate !== undefined && {
        dueDate:
          dto.dueDate === null
            ? null
            : new Date(`${dto.dueDate}T00:00:00.000Z`),
      }),
    });

    // ロック後の最新状態による判定結果を、既存APIと同じHTTP例外へ変換する。
    if (result.status === 'project_not_found') {
      throw new NotFoundException('プロジェクトが見つかりません');
    }
    if (result.status === 'forbidden') {
      throw new ForbiddenException('タスクを更新する権限がありません');
    }
    if (result.status === 'project_archived') {
      throw new ConflictException(
        'アーカイブ済みのプロジェクトにはタスクを更新できません',
      );
    }
    if (result.status === 'task_not_found') {
      throw new NotFoundException('タスクが見つかりません');
    }
    if (result.status === 'assignee_not_found') {
      throw new BadRequestException(
        '担当者は同じプロジェクトの参加者を指定してください',
      );
    }
    if (result.status === 'invalid_date_range') {
      // 片方の日付だけを変更した場合も、Repositoryが保存済みの最新値と比較する。
      throw new BadRequestException('期限は開始日以降の日付を指定してください');
    }

    // updated・unchangedのどちらも、現在のTaskを返す。
    return result.task;
  }
}
