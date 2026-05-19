import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { BudgetRepository } from '../repositories/budget.repository';
import { FilesService } from '../../common/files/files.service';

@Injectable()
export class PiBudgetService {
  constructor(
    private readonly budgetRepo: BudgetRepository,
    private readonly filesService: FilesService,
  ) { }

  /**
   * Returns the formatted list of projects for the project selector UI.
   */
  async getMyProjects(userId: string) {
    return this.budgetRepo.getMyProjectsAsPi(userId);
  }

  /**
   * Returns the full budget dashboard for one project.
   */
  async getProjectDashboard(projectId: string, userId: string) {
    const { project, budgetItems, disbursementRequests } =
      await this.budgetRepo.getProjectBudgetDashboard(projectId, userId);

    // UG projects have no budget
    if (project.projectProgram === 'UG') {
      throw new ForbiddenException(
        'UG projects do not have a disbursement budget.',
      );
    }

    const totalApprovedBudget = Number(project.budgetAmount ?? 0);
    const totalDisbursed = disbursementRequests
      .filter((r) => r.status === 'PAID')
      .reduce((sum, r) => sum + Number(r.totalAmount), 0);

    const history = await Promise.all(
      disbursementRequests.map(async (req) => {
        let clearanceDocumentUrl: string | null = null;
        let clearanceDocumentName: string | null = null;

        if (req.clearanceFile) {
          try {
            const access = await this.filesService.getFileById(
              req.clearanceFile.id,
            );
            clearanceDocumentUrl = access?.url ?? null;
          } catch {
            clearanceDocumentUrl = null;
          }
          clearanceDocumentName = req.clearanceFile.originalName;
        }

        return {
          id: req.id,
          requestSequence: req.requestSequence,
          totalAmount: req.totalAmount,
          submittedAt: req.submittedAt,
          status: req.status,
          bankTransactionId: req.bankTransactionId,
          paidAt: req.paidAt,
          clearanceDocumentUrl,
          clearanceDocumentName,
          financeFeedback: req.financeFeedback,
          items: req.items.map((i) => ({
            id: i.budgetItemId,
            description: i.description,
            amount: i.amount,
          })),
        };
      }),
    );

    return {
      projectId: project.projectId,
      title: project.projectTitle,
      projectType: project.projectProgram,
      totalApprovedBudget,
      totalDisbursed,
      remainingBalance: totalApprovedBudget - totalDisbursed,
      budgetItems: budgetItems.map((item) => ({
        id: item.id,
        description: item.description,
        category: item.category,
        amount: item.amount,
        status: item.status,
      })),
      disbursementHistory: history,
    };
  }

  /**
   * Creates a new disbursement request.
   */
  async submitRequest(
    projectId: string,
    userId: string,
    budgetItemIds: string[],
    clearanceFile?: Express.Multer.File,
  ) {
    // 1. Determine sequence number
    const existingCount =
      await this.budgetRepo.getDisbursementRequestCount(projectId);
    const requestSequence = existingCount + 1;

    // 2. Clearance gate: required for all requests after the first
    if (requestSequence > 1 && !clearanceFile) {
      throw new BadRequestException(
        'A clearance/receipt document is required for all requests after the first.',
      );
    }

    // 3. Validate items (also checks PI ownership, no duplicate active request)
    const validatedItems =
      await this.budgetRepo.validateAndFetchItemsForRequest(
        projectId,
        userId,
        budgetItemIds,
      );

    // 4. Upload clearance file if provided
    let clearanceFileId: string | null = null;
    if (clearanceFile) {
      const fileRecord = await this.uploadClearanceFile(
        clearanceFile,
        userId,
        null, // resourceId will be updated after request is created
      );
      clearanceFileId = fileRecord.fileId;
    }

    // 5. Calculate total amount
    const totalAmount = validatedItems.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );

    // 6. Create request atomically
    const request = await this.budgetRepo.createDisbursementRequest(
      projectId,
      userId,
      budgetItemIds,
      totalAmount,
      requestSequence,
      clearanceFileId,
    );

    // 7. Attach the file to the resource now that we have the requestId
    if (clearanceFileId && request.id) {
      await this.filesService.attachFile(
        clearanceFileId,
        'DISBURSEMENT_REQUEST',
        request.id,
        'CLEARANCE_DOCUMENT',
      );
    }

    return {
      requestId: request.id,
      status: 'PENDING',
      message: 'Your disbursement request has been submitted successfully.',
    };
  }

  /**
   * Resubmits a returned request with a new clearance document.
   */
  async resubmitRequest(
    requestId: string,
    userId: string,
    clearanceFile: Express.Multer.File,
  ) {
    // 1. Validate the request belongs to the user and is RETURNED
    await this.budgetRepo.validateResubmission(requestId, userId);

    // 2. Upload new clearance file
    const fileRecord = await this.uploadClearanceFile(
      clearanceFile,
      userId,
      requestId,
    );

    // 3. Resubmit
    await this.budgetRepo.resubmitDisbursementRequest(
      requestId,
      fileRecord.fileId,
    );

    return {
      requestId,
      status: 'RESUBMITTED',
      message:
        'Your request has been resubmitted with the updated clearance document.',
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Uploads a clearance file via FilesService.
   * Creates a TEMP file record initially; caller must call attachFile afterwards.
   */
  private async uploadClearanceFile(
    file: Express.Multer.File,
    userId: string,
    resourceId: string | null,
  ) {
    // Use initiateUpload to create the record, then manually upload to storage
    const fileRecord = await this.filesService.uploadTempFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      file.size,
      'DISBURSEMENT_REQUEST',
      userId,
    );

    return fileRecord;
  }
}
