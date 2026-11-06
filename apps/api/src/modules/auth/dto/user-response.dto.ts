import { ApiProperty } from '@nestjs/swagger';

// Auth API が返す User の JSON を Swagger に伝えるための DTO。
export class UserResponseDto {
  @ApiProperty({
    description: 'ユーザー ID（Supabase Auth のユーザー ID と同じ）',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: '確認済みのメールアドレス',
    format: 'email',
    example: 'bruno@example.com',
  })
  email: string;

  @ApiProperty({
    type: String,
    description:
      'Supabase Auth から同期した名前（未設定・空白・文字列以外の場合は null）',
    nullable: true,
    example: '山田 太郎',
  })
  name: string | null;

  @ApiProperty({
    description: 'アプリ側 User の作成日時',
    format: 'date-time',
    example: '2026-10-04T09:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'アプリ側 User の更新日時',
    format: 'date-time',
    example: '2026-10-04T09:00:00.000Z',
  })
  updatedAt: string;
}
