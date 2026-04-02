import { Module } from '@nestjs/common';
import { DbModule } from 'src/db/db.module';
import { DepartmentsRepository } from './departments.repository';

@Module({
  imports: [DbModule],
  providers: [DepartmentsRepository],
  exports: [DepartmentsRepository],
})
export class DepartmentsModule {}
