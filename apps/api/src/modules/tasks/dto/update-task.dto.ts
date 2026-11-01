import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidateIf,
} from 'class-validator';
import { TaskPriority, TaskStatus } from '../../../generated/prisma/enums.js';
import { TaskDateConstraint } from '../validators/task-date.constraint.js';

export class UpdateTaskDto {
  @ApiPropertyOptional({
    description: '前後の空白を除いた後、1〜200文字。省略は変更なし、nullは不可',
    minLength: 1,
    maxLength: 200,
    example: 'ログイン画面を修正する',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    type: String,
    description:
      '前後の空白を除いた詳細説明。空文字・nullは解除、省略は変更なし',
    maxLength: 5000,
    nullable: true,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional({
    enum: TaskStatus,
    description: '省略は変更なし、nullは不可',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    enum: TaskPriority,
    description: '省略は変更なし、nullは不可',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    type: String,
    description: '同じProjectの参加者のUser ID。nullは担当解除、省略は変更なし',
    format: 'uuid',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @ApiPropertyOptional({
    type: String,
    description: '開始日。時刻のないYYYY-MM-DD。nullは解除、省略は変更なし',
    format: 'date',
    example: '2026-11-02',
    nullable: true,
  })
  @IsOptional()
  @Validate(TaskDateConstraint)
  startDate?: string | null;

  @ApiPropertyOptional({
    type: String,
    description:
      '期限。更新後の開始日以降のYYYY-MM-DD。nullは解除、省略は変更なし',
    format: 'date',
    example: '2026-11-05',
    nullable: true,
  })
  @IsOptional()
  @Validate(TaskDateConstraint)
  dueDate?: string | null;
}
