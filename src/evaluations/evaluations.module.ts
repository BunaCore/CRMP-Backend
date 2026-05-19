import { Module } from '@nestjs/common';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';
import { DbModule } from 'src/db/db.module';
import { AccessControlModule } from 'src/access-control/access-control.module';

@Module({
  imports: [DbModule, AccessControlModule],
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
})
export class EvaluationsModule {}
