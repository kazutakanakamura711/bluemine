import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertUser(id: string, email: string, name: string | null) {
    try {
      return await this.prisma.user.upsert({
        where: { id },
        create: { id, email, name },
        update: { email, name },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      // 初回の並行リクエストで、同じ本人の行が先に保存された場合だけ回復する。
      // 別IDが同じメールを使っていても、そのUserを本人として扱わない。
      const user = await this.prisma.user.findUnique({ where: { id } });
      if (!user || user.email !== email) throw error;

      return this.prisma.user.update({
        where: { id },
        data: { email, name },
      });
    }
  }
}
