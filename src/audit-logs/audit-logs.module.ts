import { Global, Module } from '@nestjs/common';
import { DbModule } from 'src/db/db.module';
import { AccessControlModule } from 'src/access-control/access-control.module';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsRepository } from './audit-logs.repository';
import { AuditLogsService } from './audit-logs.service';

@Global()
@Module({
  imports: [DbModule, AccessControlModule],
  controllers: [AuditLogsController],
  providers: [AuditLogsRepository, AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
