import { Module } from '@nestjs/common';
import { PiBudgetController } from './controllers/pi-budget.controller';
import { FinanceBudgetController } from './controllers/finance-budget.controller';
import { PiBudgetService } from './services/pi-budget.service';
import { FinanceBudgetService } from './services/finance-budget.service';
import { BudgetRepository } from './repositories/budget.repository';
import { FilesModule } from '../common/files/files.module';
import { AccessControlModule } from '../access-control/access-control.module';

@Module({
  imports: [FilesModule, AccessControlModule],
  controllers: [PiBudgetController, FinanceBudgetController],
  providers: [PiBudgetService, FinanceBudgetService, BudgetRepository],
  exports: [PiBudgetService, FinanceBudgetService, BudgetRepository],
})
export class BudgetModule {}
