import {
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../generated/prisma/client.js';
import { AuthGuard, type AuthRequest } from './auth.guard.js';
import type { AuthService } from './auth.service.js';

function createContext(authorization?: string) {
  // Guard が使う HTTP ヘッダーと、ユーザーの格納先を用意する。
  const request = { headers: { authorization } } as AuthRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;

  return { request, context };
}

describe('AuthGuard', () => {
  const getMe = vi.fn<AuthService['getMe']>();
  const guard = new AuthGuard({ getMe } as unknown as AuthService);

  beforeEach(() => {
    getMe.mockReset();
  });

  it.each([undefined, 'Basic token', 'Bearer', 'Bearer token extra'])(
    'Bearer token がない・形式が不正なヘッダー %s は 401 にする',
    async (authorization) => {
      const { request, context } = createContext(authorization);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(getMe).not.toHaveBeenCalled();
      expect(request.user).toBeUndefined();
    },
  );

  it('無効な token の 401 を引き継ぎ、ユーザーを格納しない', async () => {
    const { request, context } = createContext('Bearer invalid-token');
    const error = new UnauthorizedException('有効な access token が必要です。');
    getMe.mockRejectedValueOnce(error);

    await expect(guard.canActivate(context)).rejects.toBe(error);
    expect(request.user).toBeUndefined();
  });

  it('メール未確認などの 403 を引き継ぎ、ユーザーを格納しない', async () => {
    const { request, context } = createContext('Bearer unconfirmed-token');
    const error = new ForbiddenException(
      '確認済みのメールアドレスが必要です。',
    );
    getMe.mockRejectedValueOnce(error);

    await expect(guard.canActivate(context)).rejects.toBe(error);
    expect(request.user).toBeUndefined();
  });

  it('認証に成功すると、確認済みのアプリ側 User を格納して通過させる', async () => {
    const { request, context } = createContext('Bearer valid-token');
    const user: User = {
      id: '08a5ed76-02d3-4a8b-8377-44a40a92c8f4',
      email: 'guard-test@example.test',
      name: null,
      createdAt: new Date('2026-10-03T00:00:00Z'),
      updatedAt: new Date('2026-10-03T00:00:00Z'),
    };
    getMe.mockResolvedValueOnce(user);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(getMe).toHaveBeenCalledWith('valid-token');
    expect(request.user).toBe(user);
  });
});
