import { ApiProperty } from '@nestjs/swagger';
import { TaskPriority, TaskStatus } from '../../../generated/prisma/enums.js';
import { TaskUserResponseDto } from './task-user-response.dto.js';

// Task API が返す JSON の形を Swagger に伝えるための DTO。
export class TaskResponseDto {
  @ApiProperty({
    description: 'タスク ID',
    example: 'cmua3r1ik00042ed8lasbg1jk',
  })
  id: string;

  @ApiProperty({
    description: 'タスクが所属するプロジェクトの ID',
    example: 'cmua3r1ik00032ed8lasbg1jj',
  })
  projectId: string;

  @ApiProperty({
    type: 'integer',
    description: 'プロジェクト内のタスク番号',
    minimum: 1,
    example: 12,
  })
  number: number;

  @ApiProperty({
    description: 'タスク名',
    example: 'ログイン画面を作る',
  })
  title: string;

  @ApiProperty({
    type: String,
    description: 'タスクの詳細説明',
    example: 'メールアドレスとパスワードでログインできる画面を実装する',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    type: String,
    description: 'タスクのステータス',
    enum: TaskStatus,
    example: TaskStatus.todo,
  })
  status: TaskStatus;

  @ApiProperty({
    type: String,
    description: 'タスクの優先度',
    enum: TaskPriority,
    example: TaskPriority.normal,
  })
  priority: TaskPriority;

  @ApiProperty({
    type: TaskUserResponseDto,
    description: '担当者の表示情報。未担当は null',
    nullable: true,
  })
  assignee: TaskUserResponseDto | null;

  @ApiProperty({
    type: TaskUserResponseDto,
    description: '報告者（タスク作成者）の表示情報',
  })
  reporter: TaskUserResponseDto;

  @ApiProperty({
    type: String,
    description: '開始日',
    format: 'date',
    nullable: true,
    example: '2026-10-26',
  })
  startDate: string | null;

  @ApiProperty({
    type: String,
    description: '期限',
    format: 'date',
    nullable: true,
    example: '2026-10-30',
  })
  dueDate: string | null;

  @ApiProperty({
    description: '作成日時',
    example: '2026-10-26T08:00:00.000Z',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: '更新日時',
    example: '2026-10-26T09:00:00.000Z',
    format: 'date-time',
  })
  updatedAt: string;
}
