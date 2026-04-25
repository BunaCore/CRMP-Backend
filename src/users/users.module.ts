import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { UsersController } from './users.controller';
import { DbModule } from 'src/db/db.module';
import { AccessControlModule } from 'src/access-control/access-control.module';

@Module({
  imports: [DbModule, forwardRef(() => AccessControlModule)],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
