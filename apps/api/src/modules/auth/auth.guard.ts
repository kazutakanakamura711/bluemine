import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '../../generated/prisma/client.js';
import { AuthService } from './auth.service.js';

// 認証前のリクエストでは、アプリ側 User がまだ入っていないことがある。
export interface AuthRequest extends Request {
  user?: User;
}

// AuthGuard を通過したリクエストを扱う場合は、確認済みの User を必須にする。
export interface AuthenticatedRequest extends AuthRequest {
  user: User;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  // NestJS が Controller の処理前に呼び出し、リクエストを通してよいか確認する。
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();

    // Authorization ヘッダーの「Bearer <token>」から token を取り出す。
    const token = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    )?.[1];

    if (!token) {
      throw new UnauthorizedException('Bearer token が必要です。');
    }

    // 本人確認・メール確認・User の取得／初回作成を既存の Service に任せる。
    // 認証に失敗すると例外で止まり、Controller の処理には進まない。
    request.user = await this.authService.getMe(token);

    // Controller は request.user から本人の ID などを受け取れる。
    return true;
  }
}
