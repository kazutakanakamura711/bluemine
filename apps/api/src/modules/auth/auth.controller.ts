import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { UserResponseDto } from './dto/user-response.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  // main.ts の /api と組み合わさり、GET /api/auth/me になる。
  // このメソッドに進む前に、AuthGuard が token を検証して User を格納する。
  @Get('me')
  @UseGuards(AuthGuard)
  // Swagger に必要な認証方法・処理内容・返す JSON を伝える。
  @ApiBearerAuth()
  @ApiOperation({
    summary: '認証済みユーザーの情報を取得する',
    description:
      'Supabase Auth の access token を検証し、確認済みメールアドレスを持つ本人のアプリ側 User を返す。' +
      'User が未登録なら、Supabase Auth のユーザー ID を使って初回作成する。' +
      '作成・更新時にメールアドレスと user_metadata.name を同期する。' +
      '名前は文字列なら前後の空白を除き、未設定・空白・文字列以外の場合は null にする。',
  })
  @ApiOkResponse({
    description: '認証済みユーザーのアプリ側 User を返す',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Bearer token がない、形式が不正、または token が無効',
  })
  @ApiForbiddenResponse({
    description: 'token は有効だが、メールアドレスが未設定または未確認',
  })
  getMe(@Req() request: AuthenticatedRequest) {
    // Guard を通過しているので、確認済み User が必ず入っている。
    // Controller は検証済みの User を返す。
    return request.user;
  }
}
