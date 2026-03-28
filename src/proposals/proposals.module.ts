import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { ProposalsRepository } from './proposals.repository';
import { AccessControlModule } from 'src/access-control/access-control.module';
import { DbModule } from 'src/db/db.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [AccessControlModule, DbModule, UsersModule],
  controllers: [ProposalsController],
  providers: [ProposalsService, ProposalsRepository],
})
export class ProposalsModule {}
