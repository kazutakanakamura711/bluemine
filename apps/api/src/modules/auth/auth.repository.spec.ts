import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type User } from '../../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthRepository } from './auth.repository.js';

describe('AuthRepository の初回保存の競合', () => {
  const user = {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const repository = new AuthRepository({ user } as unknown as PrismaService);
  const storedUser: User = {
    id: 'bfcb0559-87d0-445a-b6ad-049c35a1d5c9',
    email: 'auth-concurrency@example.test',
    name: '更新前の名前',
    createdAt: new Date('2026-10-24T00:00:00Z'),
    updatedAt: new Date('2026-10-24T00:00:00Z'),
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('同じID・メールの作成と競合した場合は、そのUserを更新する', async () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint',
      {
        code: 'P2002',
        clientVersion: '7.10.0',
      },
    );
    user.upsert.mockRejectedValueOnce(error);
    user.findUnique.mockResolvedValueOnce(storedUser);
    const updatedUser = { ...storedUser, name: '更新後の名前' };
    user.update.mockResolvedValueOnce(updatedUser);

    await expect(
      repository.upsertUser(storedUser.id, storedUser.email, updatedUser.name),
    ).resolves.toEqual(updatedUser);
    expect(user.findUnique).toHaveBeenCalledWith({
      where: { id: storedUser.id },
    });
    expect(user.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: storedUser.id },
      data: { email: storedUser.email, name: updatedUser.name },
    });
    expect(user.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([null, { ...storedUser, email: 'different@example.test' }])(
    '同じID・メールの行がない場合は一意制約エラーを引き継ぐ（%j）',
    async (existingUser) => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        {
          code: 'P2002',
          clientVersion: '7.10.0',
        },
      );
      user.upsert.mockRejectedValueOnce(error);
      user.findUnique.mockResolvedValueOnce(existingUser);

      await expect(
        repository.upsertUser(storedUser.id, storedUser.email, '新しい名前'),
      ).rejects.toBe(error);
      expect(user.update).not.toHaveBeenCalled();
    },
  );

  it('一意制約以外の失敗を更新で回復しようとしない', async () => {
    const error = new Error('DB connection failed');
    user.upsert.mockRejectedValueOnce(error);

    await expect(
      repository.upsertUser(storedUser.id, storedUser.email, '名前'),
    ).rejects.toBe(error);
    expect(user.findUnique).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
  });
});
