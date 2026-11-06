import { Module } from '@nestjs/common';
import { TaskController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { TasksRepository } from './tasks.repository.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TaskController],
  providers: [TasksService, TasksRepository],
})
export class TasksModule {}
