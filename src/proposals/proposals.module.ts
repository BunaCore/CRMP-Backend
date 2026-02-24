import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { AccessControlModule } from 'src/access-control/access-control.module';
import { DbModule } from 'src/db/db.module';

@Module({
    imports: [AccessControlModule, DbModule],
    controllers: [ProposalsController],
    providers: [ProposalsService],
})
export class ProposalsModule { }
