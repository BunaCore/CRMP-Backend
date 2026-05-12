import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/jwt.guard';
import { AccessGuard } from '../../access-control/access.guard';
import { RequirePermission } from '../../access-control/require-permission.decorator';
import { Permission } from '../../access-control/permission.enum';
import { PiBudgetService } from '../services/pi-budget.service';
import { CreateDisbursementDto } from '../dto/create-disbursement.dto';

@Controller('budget')
@UseGuards(JwtAuthGuard, AccessGuard)
@RequirePermission(Permission.BUDGET_VIEW)
export class PiBudgetController {
  constructor(private readonly piService: PiBudgetService) {}

  /**
   * GET /budget/my-projects
   * Returns all projects where the caller is PI.
   */
  @Get('my-projects')
  async getMyProjects(@Req() req) {
    return this.piService.getMyProjects(req.user.id);
  }

  /**
   * GET /budget/project/:projectId/dashboard
   * Returns full budget dashboard for one project.
   */
  @Get('project/:projectId/dashboard')
  async getProjectDashboard(
    @Req() req,
    @Param('projectId') projectId: string,
  ) {
    return this.piService.getProjectDashboard(projectId, req.user.id);
  }

  /**
   * POST /budget/project/:projectId/request
   * Submits a new disbursement request.
   * Body (multipart/form-data): budgetItemIds[] + optional clearanceDocument file.
   */
  @Post('project/:projectId/request')
  @UseInterceptors(FileInterceptor('clearanceDocument'))
  async submitRequest(
    @Req() req,
    @Param('projectId') projectId: string,
    @Body() body: CreateDisbursementDto,
    @UploadedFile() clearanceFile?: Express.Multer.File,
  ) {
    // body.budgetItemIds may arrive as a comma-separated string
    // or as an array depending on multipart encoding — normalize it:
    const ids = Array.isArray(body.budgetItemIds)
      ? body.budgetItemIds
      : [body.budgetItemIds];

    return this.piService.submitRequest(
      projectId,
      req.user.id,
      ids,
      clearanceFile,
    );
  }

  /**
   * PATCH /budget/request/:requestId/resubmit
   * Re-uploads a clearance doc and resubmits a returned request.
   */
  @Patch('request/:requestId/resubmit')
  @UseInterceptors(FileInterceptor('clearanceDocument'))
  async resubmitRequest(
    @Req() req,
    @Param('requestId') requestId: string,
    @UploadedFile() clearanceFile: Express.Multer.File,
  ) {
    if (!clearanceFile) {
      throw new BadRequestException(
        'A clearance document file is required for resubmission.',
      );
    }
    return this.piService.resubmitRequest(requestId, req.user.id, clearanceFile);
  }
}
