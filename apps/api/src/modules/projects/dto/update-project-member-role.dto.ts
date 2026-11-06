import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ProjectMemberRole } from '../../../generated/prisma/enums.js';

export class UpdateProjectMemberRoleDto {
  @ApiProperty({
    type: String,
    description:
      '変更後のプロジェクト内での役割。member・viewer のみ指定できる',
    enum: [ProjectMemberRole.member, ProjectMemberRole.viewer],
    example: ProjectMemberRole.member,
  })
  @IsIn([ProjectMemberRole.member, ProjectMemberRole.viewer])
  role: Exclude<ProjectMemberRole, typeof ProjectMemberRole.owner>;
}
