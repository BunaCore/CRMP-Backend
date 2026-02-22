import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AccessGuard } from './access.guard';

@Module({
  providers: [AccessService, AccessGuard],
  exports: [AccessService, AccessGuard],
})
export class AccessControlModule {}
