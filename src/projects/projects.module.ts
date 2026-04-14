import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './projects.repository';
import { DbModule } from 'src/db/db.module';

@Module({
  imports: [DbModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectsRepository],
  exports: [ProjectsService],
})
export class ProjectsModule {}