import { IsEmail, IsIn } from 'class-validator';
import { ProjectMemberRole } from '../../../generated/prisma/enums.js';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectMemberDto {
  @ApiProperty({
    description: '参加させたいユーザーのメールアドレス',
    example: 'user@example.com',
    format: 'email',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsEmail()
  email: string;

  @ApiProperty({
    description: '参加させるユーザーのプロジェクト内での役割',
    enum: [ProjectMemberRole.member, ProjectMemberRole.viewer],
    example: ProjectMemberRole.member,
  })
  @IsIn([ProjectMemberRole.member, ProjectMemberRole.viewer])
  role: Exclude<ProjectMemberRole, typeof ProjectMemberRole.owner>;
}
