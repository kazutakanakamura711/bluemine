import { ApiProperty } from '@nestjs/swagger';
import { ProjectMemberRole } from '../../../generated/prisma/enums.js';
import { ProjectResponseDto } from './project-response.dto.js';

// Project 詳細 API のレスポンスを Swagger に伝える。
export class ProjectDetailResponseDto extends ProjectResponseDto {
  @ApiProperty({
    type: String,
    description: '対象プロジェクトにおける認証済みユーザー自身の role',
    enum: ProjectMemberRole,
    example: ProjectMemberRole.owner,
  })
  currentUserRole: ProjectMemberRole;
}
