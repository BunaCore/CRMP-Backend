import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsRepository } from './documents.repository';
import { TiptapValidator } from './tiptap-validator.service';
import { TiptapRenderer } from './tiptap-renderer.service';
import { MarkdownConverter } from './markdown-converter.service';
import { DbModule } from 'src/db/db.module';
import { AccessControlModule } from 'src/access-control/access-control.module';
import { ProjectsModule } from 'src/projects/projects.module';
import { WorkspaceAccessService } from './workspace-access.service';
import { WorkspaceManagerService } from './workspace-manager.service';

@Module({
  imports: [DbModule, AccessControlModule, ProjectsModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentsRepository,
    TiptapValidator,
    TiptapRenderer,
    MarkdownConverter,
    WorkspaceAccessService,
    WorkspaceManagerService,
  ],
  exports: [
    DocumentsService,
    TiptapValidator,
    WorkspaceAccessService,
    WorkspaceManagerService,
  ],
})
export class DocumentsModule {}