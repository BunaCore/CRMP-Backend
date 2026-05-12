import { Injectable } from '@nestjs/common';
import { BudgetRepository } from '../repositories/budget.repository';
import { FilesService } from '../../common/files/files.service';

@Injectable()
export class FinanceBudgetService {
  constructor(
    private readonly repo: BudgetRepository,
    private readonly filesService: FilesService,
  ) {}

  /**
   * Returns the 4-metric summary for the finance dashboard header cards.
   */
  async getAdminMetrics() {
    return this.repo.getAdminMetrics();
  }

  /**
   * Lists all requests with optional status filter.
   * Enriches clearanceDocumentUrl with a presigned URL via FilesService.
   */
  async listRequests(statusFilter: string[]) {
    const requests = await this.repo.listAllDisbursementRequests(statusFilter);

    for (const req of requests) {
      if (req.clearanceFileId) {
        const fileAccess = await this.filesService.getFileById(req.clearanceFileId);
        req.clearanceDocumentUrl = fileAccess?.url ?? null;
      }
      // Remove internal field from response
      delete req.clearanceFileId;
    }

    return requests;
  }

  /**
   * Returns detailed view of one request for the Review Drawer.
   * Enriches clearanceDocumentUrl with a presigned URL.
   */
  async getRequestDetail(requestId: string) {
    const detail = await this.repo.getDisbursementRequestDetail(requestId);

    if (detail.clearanceFileId) {
      const fileAccess = await this.filesService.getFileById(detail.clearanceFileId);
      detail.clearanceDocumentUrl = fileAccess?.url ?? null;
    }
    delete detail.clearanceFileId;

    return detail;
  }

  /**
   * Approves a disbursement request (marks as PAID).
   * 1. Validates the request is actionable (PENDING or RESUBMITTED, clearance gate).
   * 2. Transactionally updates request + budget items to PAID.
   * 3. Returns confirmation shape.
   */
  async approveRequest(
    requestId: string,
    financeUserId: string,
    bankTransactionId: string,
  ) {
    await this.repo.validateForFinanceAction(requestId);
    const result = await this.repo.approveDisbursementRequest(
      requestId,
      financeUserId,
      bankTransactionId,
    );
    return {
      requestId,
      status: 'PAID',
      paidAt: result.paidAt,
      message: 'Funds released successfully.',
    };
  }

  /**
   * Returns a disbursement request to the PI for correction.
   * 1. Validates the request is actionable.
   * 2. Transactionally updates request + reverts budget items to AVAILABLE.
   * 3. Returns confirmation shape.
   */
  async returnRequest(
    requestId: string,
    financeUserId: string,
    feedback: string,
  ) {
    await this.repo.validateForFinanceAction(requestId);
    await this.repo.returnDisbursementRequest(requestId, financeUserId, feedback);
    return {
      requestId,
      status: 'RETURNED',
      message: 'Request returned to PI for correction.',
    };
  }
}
