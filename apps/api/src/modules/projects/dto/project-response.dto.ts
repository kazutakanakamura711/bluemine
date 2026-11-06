import { ApiProperty } from '@nestjs/swagger';

// Project API が返す JSON の形を Swagger に伝えるための DTO。
export class ProjectResponseDto {
  @ApiProperty({
    description: 'プロジェクト ID',
    example: 'cmua3r1ik00032ed8lasbg1jj',
  })
  id: string;

  @ApiProperty({
    description:
      'プロジェクトの作成者（owner）の User ID。Supabase Auth と同じ UUID',
    format: 'uuid',
    example: '11111111-1111-4111-8111-111111111111',
  })
  ownerId: string;

  @ApiProperty({
    description: 'プロジェクト名',
    example: 'Task Management App',
  })
  name: string;

  @ApiProperty({
    description: 'プロジェクトキー',
    example: 'APP',
  })
  key: string;

  @ApiProperty({
    // `string | null` は実行時の型情報だけでは Object と解釈されるため、
    // Swagger 用に文字列であることを明示する。
    type: String,
    description: 'プロジェクトの概要・目的',
    example: 'Bluemine の開発プロジェクト',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: 'アーカイブ済みかどうか',
    example: false,
  })
  isArchived: boolean;

  @ApiProperty({
    description: '作成日時',
    example: '2026-09-21T10:00:00.000Z',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: '更新日時',
    example: '2026-09-21T10:00:00.000Z',
    format: 'date-time',
  })
  updatedAt: string;
}
