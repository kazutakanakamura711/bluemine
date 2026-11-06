import { ApiProperty } from '@nestjs/swagger';

// メンバー一覧に含める User の表示情報。
export class ProjectMemberUserResponseDto {
  @ApiProperty({
    type: String,
    description: 'ユーザーの表示名。未設定は null',
    example: '山田太郎',
    nullable: true,
  })
  name: string | null;

  @ApiProperty({
    description: 'ユーザーのメールアドレス',
    format: 'email',
    example: 'owner@example.test',
  })
  email: string;
}
