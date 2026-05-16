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
import { AdminProjectsController } from './admin-projects.controller';
import { AdminProjectsService } from './admin-projects.service';
import { ProposalsModule } from 'src/proposals/proposals.module';
import { MailModule } from 'src/mail/mail.module';

@Module({
  imports: [
    DbModule,
    AccessControlModule,
    FilesModule,
    ProposalsModule,
    MailModule,
  ],
  controllers: [
    ProjectsController,
    PublicProjectsController,
    AdminProjectsController,
  ],
  providers: [ProjectsService, ProjectsRepository, AdminProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
