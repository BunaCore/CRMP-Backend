import { Module } from '@nestjs/common';
import { PgController } from './pg.controller';
import { PgService } from './pg.service';
import { PgRepository } from './pg.repository';
import { AccessControlModule } from 'src/access-control/access-control.module';
import { DbModule } from 'src/db/db.module';

@Module({
  imports: [DbModule, AccessControlModule],
  controllers: [PgController],
  providers: [PgService, PgRepository],
  exports: [PgRepository],
})
export class PgModule {}
