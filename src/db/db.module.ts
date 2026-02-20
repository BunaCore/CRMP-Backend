import { Global, Module } from '@nestjs/common';
import { DrizzleService } from './db.service';

@Global()
@Module({
  providers: [DrizzleService],
  exports: [DrizzleService],
})
export class DrizzleModule {}
