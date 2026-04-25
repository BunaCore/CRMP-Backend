import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UsersController } from './users.controller';
import { DbModule } from 'src/db/db.module';
import { AccessControlModule } from 'src/access-control/access-control.module';
import { RolesRepository } from 'src/db/roles.repository';
import { QueuesModule } from 'src/queues/queues.module';

@Module({
  imports: [DbModule, forwardRef(() => AccessControlModule), QueuesModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, RolesRepository],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
