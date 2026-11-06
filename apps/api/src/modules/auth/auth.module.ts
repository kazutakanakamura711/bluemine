import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthGuard } from './auth.guard.js';

@Module({
  imports: [PrismaModule],
  providers: [AuthService, AuthRepository, AuthGuard],
  controllers: [AuthController],
  // AuthModule を import した機能から、Guard とその依存先を使えるようにする。
  exports: [AuthGuard, AuthService],
})
export class AuthModule {}
