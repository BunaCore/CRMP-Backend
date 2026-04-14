import { Module } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { WorkspacesRepository } from './workspaces.repository';
import { DbModule } from 'src/db/db.module';
import { ProjectsModule } from 'src/projects/projects.module';
import { DocumentsModule } from 'src/documents/documents.module';

@Module({
  imports: [DbModule, ProjectsModule, DocumentsModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}