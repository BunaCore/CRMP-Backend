import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AccessGuard } from './access.guard';
import { AbilityFactory } from './ability.factory';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [UsersModule],
  providers: [AccessService, AccessGuard, AbilityFactory],
  exports: [AccessService, AccessGuard, AbilityFactory, UsersModule],
})
export class AccessControlModule {}
