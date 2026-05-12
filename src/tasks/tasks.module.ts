import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksRepository } from './tasks.repository';
import { DbModule } from 'src/db/db.module';
import { ProjectsModule } from 'src/projects/projects.module';

@Module({
  imports: [DbModule, ProjectsModule],
  controllers: [TasksController],
  providers: [TasksService, TasksRepository],
})
export class TasksModule {}
