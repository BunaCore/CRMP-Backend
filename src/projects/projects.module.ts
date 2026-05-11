import { Module } from '@nestjs/common';
import {
  ProjectsController,
  PublicProjectsController,
} from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectsRepository } from './projects.repository';
import { DbModule } from 'src/db/db.module';
import { AccessControlModule } from 'src/access-control';
import { FilesModule } from 'src/common/files/files.module';

@Module({
  imports: [DbModule, AccessControlModule, FilesModule],
  controllers: [ProjectsController, PublicProjectsController],
  providers: [ProjectsService, ProjectsRepository],
  exports: [ProjectsService],
})
export class ProjectsModule {}
