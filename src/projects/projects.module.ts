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
import { MlModule } from 'src/ml/ml.module';
import { TiptapRenderer } from 'src/documents/tiptap-renderer.service';

@Module({
  imports: [DbModule, AccessControlModule, FilesModule, MlModule],
  controllers: [ProjectsController, PublicProjectsController],
  providers: [ProjectsService, ProjectsRepository, TiptapRenderer],
  exports: [ProjectsService],
})
export class ProjectsModule {}
