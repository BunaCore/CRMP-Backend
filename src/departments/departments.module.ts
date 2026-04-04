import { Module } from '@nestjs/common';
import { DbModule } from 'src/db/db.module';
import { DepartmentsRepository } from './departments.repository';
import { DepartmentsService } from './departments.service';
import { DepartmentsController } from './departments.controller';

@Module({
  imports: [DbModule],
  providers: [DepartmentsRepository, DepartmentsService],
  controllers: [DepartmentsController],
  exports: [DepartmentsRepository, DepartmentsService],
})
export class DepartmentsModule {}
