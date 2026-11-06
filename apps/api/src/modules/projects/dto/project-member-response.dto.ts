import { ApiProperty } from '@nestjs/swagger';
import { ProjectMemberUserResponseDto } from './project-member-user-response.dto.js';
import { ProjectMemberRole } from '../../../generated/prisma/enums.js';

// ProjectMember 一覧の各要素が返す JSON の形を Swagger に伝えるための DTO。
export class ProjectMemberResponseDto {
  @ApiProperty({
    description: 'プロジェクト参加情報の ID。role 変更・削除時の memberId',
    example: 'cmua3r1ik00032ed8lasbg1jj',
  })
  id: string;

  @ApiProperty({
    description: '参加している User の ID。Supabase Auth と同じ UUID',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  userId: string;

  @ApiProperty({
    type: String,
    description: 'プロジェクト内での役割',
    enum: ProjectMemberRole,
    example: ProjectMemberRole.owner,
  })
  role: ProjectMemberRole;

  @ApiProperty({
    description: '参加日時。ProjectMember の作成日時',
    format: 'date-time',
    example: '2026-10-11T10:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: '参加しているユーザーの表示情報',
    type: ProjectMemberUserResponseDto,
  })
  user: ProjectMemberUserResponseDto;
}
