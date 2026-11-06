import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';

@Module({
  imports: [
    HealthModule,
    PrismaModule,
    AuthModule,
    ProjectsModule,
    TasksModule,
  ],
})
export class AppModule {}
