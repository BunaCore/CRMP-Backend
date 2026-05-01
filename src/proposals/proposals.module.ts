import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { ProposalMembersService } from './proposal-members.service';
import { ProposalsRepository } from './proposals.repository';
import { ProposalApprovalRepository } from './proposal-approval.repository';
import { ProposalApprovalService } from './proposal-approval.service';
import { WorkflowService } from './workflow.service';
import { AccessControlModule } from 'src/access-control/access-control.module';
import { DbModule } from 'src/db/db.module';
import { UsersModule } from 'src/users/users.module';
import { FilesModule } from 'src/common/files/files.module';
import { ChatModule } from 'src/chat/chat.module';

@Module({
  imports: [
    AccessControlModule,
    DbModule,
    UsersModule,
    ChatModule,
    FilesModule,
  ],
  controllers: [ProposalsController],
  providers: [
    ProposalsService,
    ProposalMembersService,
    ProposalsRepository,
    ProposalApprovalRepository,
    ProposalApprovalService,
    WorkflowService,
  ],
  exports: [WorkflowService],
})
export class ProposalsModule {}
