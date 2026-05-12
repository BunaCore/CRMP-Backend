import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AccessGuard } from '../../access-control/access.guard';
import { RequirePermission } from '../../access-control/require-permission.decorator';
import { Permission } from '../../access-control/permission.enum';
import { FinanceBudgetService } from '../services/finance-budget.service';
import { ApproveDisbursementDto } from '../dto/approve-disbursement.dto';
import { ReturnDisbursementDto } from '../dto/return-disbursement.dto';

@Controller('budget/admin')
@UseGuards(JwtAuthGuard, AccessGuard)
@RequirePermission(Permission.BUDGET_VIEW)
export class FinanceBudgetController {
  constructor(private readonly financeService: FinanceBudgetService) {}

  /**
   * GET /budget/admin/metrics
   * Returns the 4-metric summary for the finance dashboard header cards.
   */
  @Get('metrics')
  async getMetrics() {
    return this.financeService.getAdminMetrics();
  }

  /**
   * GET /budget/admin/requests?status=PENDING&status=RESUBMITTED
   * Lists all requests with optional status filter(s).
   * 'status' can be a single string or an array of strings.
   */
  @Get('requests')
  async listRequests(@Query('status') status: string | string[]) {
    const statusFilter = status
      ? Array.isArray(status)
        ? status
        : [status]
      : [];
    return this.financeService.listRequests(statusFilter);
  }

  /**
   * GET /budget/admin/requests/:requestId
   * Returns full detail for the Review Drawer.
   */
  @Get('requests/:requestId')
  async getRequestDetail(@Param('requestId') requestId: string) {
    return this.financeService.getRequestDetail(requestId);
  }

  /**
   * PATCH /budget/admin/requests/:requestId/approve
   * Stamps a request as PAID. Requires BUDGET_APPROVE permission.
   */
  @Patch('requests/:requestId/approve')
  @RequirePermission(Permission.BUDGET_APPROVE)
  async approveRequest(
    @Req() req,
    @Param('requestId') requestId: string,
    @Body() body: ApproveDisbursementDto,
  ) {
    return this.financeService.approveRequest(
      requestId,
      req.user.id,
      body.bankTransactionId,
    );
  }

  /**
   * PATCH /budget/admin/requests/:requestId/return
   * Returns a request to the PI for correction. Requires BUDGET_REJECT permission.
   */
  @Patch('requests/:requestId/return')
  @RequirePermission(Permission.BUDGET_REJECT)
  async returnRequest(
    @Req() req,
    @Param('requestId') requestId: string,
    @Body() body: ReturnDisbursementDto,
  ) {
    return this.financeService.returnRequest(
      requestId,
      req.user.id,
      body.feedback,
    );
  }
}
