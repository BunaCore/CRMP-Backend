import { forwardRef, Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AccessGuard } from './access.guard';
import { AbilityFactory } from './ability.factory';
import { UsersModule } from 'src/users/users.module';
import { AccessRepository } from './access.repository';
import { AccessController } from './access.controller';

@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [AccessController],
  providers: [AccessService, AccessGuard, AbilityFactory, AccessRepository],
  exports: [AccessService, AccessGuard, AbilityFactory],
})
export class AccessControlModule {}
