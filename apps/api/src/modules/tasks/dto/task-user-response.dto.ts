import { ApiProperty } from '@nestjs/swagger';

// Task の担当者・報告者として返す User の表示情報。
export class TaskUserResponseDto {
  @ApiProperty({
    description: 'ユーザー ID。Supabase Auth と同じ UUID',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  id: string;

  @ApiProperty({
    type: String,
    description: 'ユーザーの表示名。未設定は null',
    nullable: true,
    example: '山田太郎',
  })
  name: string | null;
}
