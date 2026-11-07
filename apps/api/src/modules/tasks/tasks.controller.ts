import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { type AuthenticatedRequest, AuthGuard } from '../auth/auth.guard.js';
import { TaskResponseDto } from './dto/task-response.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@ApiTags('Tasks')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Bearer token がない、形式が不正、または token が無効',
})
@ApiForbiddenResponse({
  description: 'メールアドレスが未設定または未確認',
})
@Controller('projects/:projectId/tasks')
export class TaskController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: '参加しているプロジェクトのタスク一覧を取得する',
  })
  @ApiParam({
    name: 'projectId',
    description: 'タスクを取得するプロジェクトの ID',
    example: 'cmua3r1ik00032ed8lasbg1jj',
  })
  @ApiOkResponse({
    description:
      'owner・member・viewer に対象プロジェクトのタスクを作成日時の新しい順、同日時はIDの降順で返す。アーカイブ済みも閲覧でき、タスクがない場合は空配列を返す',
    type: TaskResponseDto,
    isArray: true,
  })
  @ApiNotFoundResponse({
    description: '指定したプロジェクトが存在しない、または参加していない',
  })
  async findAll(
    @Param('projectId') projectId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<TaskResponseDto[]> {
    const tasks = await this.tasksService.findAll(projectId, request.user.id);

    return tasks.map(toTaskResponse);
  }

  @Get(':taskId')
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: '参加しているプロジェクトのタスク詳細を取得する',
  })
  @ApiParam({
    name: 'projectId',
    description: 'タスクが所属するプロジェクトの ID',
  })
  @ApiParam({
    name: 'taskId',
    description: '取得するタスクの ID',
  })
  @ApiOkResponse({
    description:
      'owner・member・viewer に対象プロジェクトのタスクを1件返す。アーカイブ済みも閲覧できる',
    type: TaskResponseDto,
  })
  @ApiNotFoundResponse({
    description:
      'プロジェクトが存在しない、参加していない、または指定したプロジェクト内にタスクが存在しない',
  })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.findOne(
      projectId,
      taskId,
      request.user.id,
    );

    return toTaskResponse(task);
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '参加しているプロジェクトにタスクを作成する' })
  @ApiParam({
    name: 'projectId',
    description: 'タスクを作成するプロジェクトのID',
  })
  @ApiCreatedResponse({
    description:
      'owner・memberが作成できる。番号は自動採番し、報告者は認証済み本人を設定する',
    type: TaskResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      '入力が不正、定義外の項目がある、または担当者が同じProjectの参加者ではない',
  })
  @ApiForbiddenResponse({
    description: 'メール未設定・未確認、または本人がviewer',
  })
  @ApiNotFoundResponse({
    description: 'プロジェクトが存在しない、または参加していない',
  })
  @ApiConflictResponse({
    description: 'アーカイブ済みProject、またはタスク番号の競合',
  })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.create(
      projectId,
      dto,
      request.user.id,
    );
    return toTaskResponse(task);
  }

  @Patch(':taskId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: '参加しているプロジェクトのタスクを更新する' })
  @ApiParam({
    name: 'projectId',
    description: 'タスクが所属するプロジェクトのID',
  })
  @ApiParam({
    name: 'taskId',
    description: '更新するタスクのID',
  })
  @ApiOkResponse({
    description:
      'owner・memberが指定した項目だけを更新し、更新後のタスクを返す。同じ値なら更新日時を維持する',
    type: TaskResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      '入力不正・更新項目なし・定義外の項目・日付の前後関係不正、または担当者が同じProjectの参加者ではない',
  })
  @ApiForbiddenResponse({
    description: 'メール未設定・未確認、または本人がviewer',
  })
  @ApiNotFoundResponse({
    description:
      'プロジェクトが存在しない、参加していない、または指定したプロジェクト内にタスクが存在しない',
  })
  @ApiConflictResponse({
    description: 'アーカイブ済みProject',
  })
  async update(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<TaskResponseDto> {
    const task = await this.tasksService.update(
      projectId,
      taskId,
      dto,
      request.user.id,
    );

    return toTaskResponse(task);
  }

  @Delete(':taskId')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'プロジェクトのタスクを削除する（ownerのみ）',
    description:
      '指定したProject内のタスクを1件削除する。アーカイブ済みのProjectでは削除できない。リクエスト本文は使用しない。',
  })
  @ApiParam({
    name: 'projectId',
    description: 'タスクが所属するプロジェクトのID',
  })
  @ApiParam({
    name: 'taskId',
    description: '削除するタスクのID',
  })
  @ApiNoContentResponse({
    description: 'タスクを削除する。レスポンス本文は返さない',
  })
  @ApiForbiddenResponse({
    description: 'メールアドレスが未設定・未確認、または本人のroleがowner以外',
  })
  @ApiNotFoundResponse({
    description:
      'プロジェクトが存在しない、参加していない、または指定したProject内にタスクが存在しない。削除済みのIDも対象不在として扱う',
  })
  @ApiConflictResponse({
    description: 'Projectがアーカイブ済み。タスクの有無より先に判定する',
  })
  async delete(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.tasksService.delete(projectId, taskId, request.user.id);
  }
}

// 一覧・詳細・作成・更新で、公開項目と日付の返却形式を揃える。
function toTaskResponse(
  task: Awaited<ReturnType<TasksService['create']>>,
): TaskResponseDto {
  return {
    id: task.id,
    projectId: task.projectId,
    number: task.number,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    reporter: task.reporter,
    startDate: task.startDate?.toISOString().slice(0, 10) ?? null, // ISO文字列から 2026-10-26 の部分を取り出す
    dueDate: task.dueDate?.toISOString().slice(0, 10) ?? null, // ISO文字列から 2026-10-26 の部分を取り出す
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
