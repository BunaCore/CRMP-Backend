import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  Param,
  ParseUUIDPipe,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProposalsService } from './proposals.service';
import { ProposalMembersService } from './proposal-members.service';
import { WorkflowService } from './workflow.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import {
  ApprovalActionDto,
  WorkflowActionResponseDto,
} from './dto/workflow.dto';
import {
  AddMembersDto,
  RemoveMembersDto,
  AssignAdvisorDto,
  AssignEvaluatorsDto,
} from './dto/manage-members.dto';
import { GetProposalsQueryDto } from './dto/get-proposals-query.dto';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import {
  CurrentUser,
  type AuthenticatedUser,
} from 'src/auth/decorators/current-user.decorator';
import { AccessGuard } from 'src/access-control/access.guard';
import { RequirePermission } from 'src/access-control/require-permission.decorator';
import { Permission } from 'src/access-control/permission.enum';

@Controller('proposals')
@UseGuards(JwtAuthGuard, AccessGuard) // 🛡️ Execution order: 1. Auth, 2. Permissions
export class ProposalsController {
  constructor(
    private readonly proposalsService: ProposalsService,
    private readonly proposalMembersService: ProposalMembersService,
    private readonly workflowService: WorkflowService,
  ) {}

  /**
   * GET /proposals
   * Fetch proposals with flexible filtering, searching, and pagination
   * Supports:
   * - me?: boolean - Filter by user association (creator or member)
   * - roles?: string - Comma-separated roles (PI,MEMBER,ADVISOR,EVALUATOR)
   * - status?: string - proposal status filter
   * - program?: string - proposal program filter
   * - departmentId?: string - department filter
   * - search?: string - full-text search on title
   * - page?: number - pagination page (default 1)
   * - limit?: number - items per page (default 10, max 50)
   *
   * Examples:
   * GET /proposals
   * GET /proposals?me=true
   * GET /proposals?roles=PI,ADVISOR
   * GET /proposals?status=Under_Review&page=1&limit=20
   * GET /proposals?search=malaria&departmentId=dept-123
   */

  /**
   * GET /proposals/detail
   * Fetch all proposals for the currently logged-in researcher
   * This hides the User ID from the browser address bar for privacy.
   * Scoped: only returns proposals where the logged-in user is creator or member
   * Includes: full details, workflow feedback, comments, and defence schedules
   */
  @Get('detail')
  async getMyDetailedProposals(@CurrentUser() user: AuthenticatedUser) {
    return this.proposalsService.getResearcherProposals(user.id);
  }

  @Get()
  async getAllProposals(
    @Query() query: GetProposalsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proposalsService.getProposals(query, user.id);
  }

  /**
   * GET /proposals/my
   * Fetch all proposals created by the authenticated user
   * Simple ownership-based query
   */
  @Get('my')
  async getMyProposals(@CurrentUser() user: AuthenticatedUser) {
    return this.proposalsService.getMyProposals(user.id);
  }

  /**
   * GET /proposals/pending-approvals
   * Fetch proposals pending user's approval based on workflow role
   * Dynamic workflow-based query with role resolution
   */
  @Get('pending-approvals')
  async getPendingApprovals(@CurrentUser() user: AuthenticatedUser) {
    return this.proposalsService.getPendingApprovals(user);
  }

  /**
   * GET /proposals/:id
   * Fetch detailed proposal view
   * Includes members, workflow steps, and department info
   */
  @Get(':id')
  async getProposalDetail(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
  ) {
    return this.proposalsService.getProposalByIdDetailed(proposalId);
  }

  @Post()
  @RequirePermission(Permission.PROPOSAL_CREATE)
  @UseInterceptors(FileInterceptor('file'))
  async submitProposal(
    @Body() createProposalDto: CreateProposalDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: 'application/pdf' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('submit') submit?: string,
  ) {
    const shouldSubmit = submit === 'true';
    return this.proposalsService.create(
      user,
      createProposalDto,
      file,
      shouldSubmit,
    );
  }

  /**
   * POST /proposals/:id/submit
   * Submit proposal to workflow (Draft → Under_Review)
   * First submission: generates approval steps
   * Resubmission: resumes from last incomplete step
   */
  @Post(':id/submit')
  async submit(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WorkflowActionResponseDto> {
    const result = await this.workflowService.submitProposal(
      proposalId,
      user.id,
    );
    return {
      success: true,
      message: 'Proposal submitted successfully',
      proposalId: result,
      newStatus: 'Under_Review',
    };
  }

  /**
   * POST /proposals/:id/approve
   * Approve current step and advance to next
   * If final step: creates project and unlocks workspace
   * Requires user to be valid approver (enforced in service)
   */
  @Post(':id/approve')
  async approve(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApprovalActionDto,
  ): Promise<WorkflowActionResponseDto> {
    const result = await this.workflowService.acceptStep(
      proposalId,
      user.id,
      dto.note,
    );

    return {
      success: result.success,
      message: result.isComplete
        ? 'Proposal approved and project created successfully'
        : `Step approved. Advanced to Step ${result.nextStep}`,
      proposalId,
      newStatus: result.isComplete ? 'Approved' : 'Under_Review',
      isComplete: result.isComplete,
      nextStep: result.nextStep,
    };
  }

  /**
   * POST /proposals/:id/reject
   * Reject current approval step
   * Transitions proposal to Rejected (Draft) status
   * Requires note explaining rejection
   */
  @Post(':id/reject')
  async reject(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApprovalActionDto,
  ): Promise<WorkflowActionResponseDto> {
    if (!dto.note || dto.note.trim().length === 0) {
      throw new BadRequestException('Rejection reason (note) is required');
    }

    const result = await this.workflowService.rejectStep(
      proposalId,
      user.id,
      dto.note,
    );

    return {
      success: result.success,
      message: 'Proposal rejected. Creator can now resubmit.',
      proposalId,
      newStatus: 'Rejected',
    };
  }

  /**
   * POST /proposals/:id/request-revision
   * Request revision on current approval step
   * Transitions proposal to Needs_Revision with editing enabled
   * Requires note explaining revision needed
   */
  @Post(':id/request-revision')
  async requestRevision(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApprovalActionDto,
  ): Promise<WorkflowActionResponseDto> {
    if (!dto.note || dto.note.trim().length === 0) {
      throw new BadRequestException('Revision reason (note) is required');
    }

    const result = await this.workflowService.requestRevision(
      proposalId,
      user.id,
      dto.note,
    );

    return {
      success: result.success,
      message:
        'Revision requested. Creator can now edit and resubmit proposal.',
      proposalId,
      newStatus: 'Needs_Revision',
    };
  }

  /**
   * POST /proposals/:id/members/add
   * Add members to a proposal
   * Handles duplicate filtering and validates all users exist
   * Requires PROPOSAL_MANAGE_MEMBERS permission
   */
  @Post(':id/members/add')
  @RequirePermission(Permission.PROPOSAL_MANAGE_MEMBERS)
  async addMembers(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddMembersDto,
  ) {
    return this.proposalMembersService.addMembers(proposalId, dto.members);
  }

  /**
   * POST /proposals/:id/members/remove
   * Remove members from a proposal
   * Requires PROPOSAL_MANAGE_MEMBERS permission
   */
  @Post(':id/members/remove')
  @RequirePermission(Permission.PROPOSAL_MANAGE_MEMBERS)
  async removeMembers(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RemoveMembersDto,
  ) {
    return this.proposalMembersService.removeMembers(proposalId, dto.userIds);
  }

  /**
   * POST /proposals/:id/advisor/assign
   * Assign a single advisor to a proposal
   * Replaces existing advisor if one exists
   * Requires PROPOSAL_MANAGE_MEMBERS permission
   */
  @Post(':id/advisor/assign')
  @RequirePermission(Permission.PROPOSAL_MANAGE_MEMBERS)
  async assignAdvisor(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignAdvisorDto,
  ) {
    return this.proposalMembersService.assignAdvisor(proposalId, dto.userId);
  }

  /**
   * POST /proposals/:id/evaluators/assign
   * Assign evaluators to a proposal
   * Adds to existing evaluators (multiple allowed)
   * Requires PROPOSAL_MANAGE_MEMBERS permission
   */
  @Post(':id/evaluators/assign')
  @RequirePermission(Permission.PROPOSAL_MANAGE_MEMBERS)
  async assignEvaluators(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignEvaluatorsDto,
  ) {
    return this.proposalMembersService.assignEvaluators(
      proposalId,
      dto.userIds,
    );
  }

  /**
   * GET /proposals/:id/members
   * Fetch core members (PI + MEMBER) for a proposal
   * No permission check required (read-only)
   */
  @Get(':id/members')
  async getCoreMembers(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proposalMembersService.getCoreMembers(proposalId);
  }

  /**
   * GET /proposals/:id/advisors
   * Fetch advisors (ADVISOR role) for a proposal
   * No permission check required (read-only)
   */
  @Get(':id/advisors')
  async getAdvisors(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proposalMembersService.getAdvisors(proposalId);
  }

  /**
   * GET /proposals/:id/evaluators
   * Fetch evaluators (EVALUATOR role) for a proposal
   * No permission check required (read-only)
   */
  @Get(':id/evaluators')
  async getEvaluators(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proposalMembersService.getEvaluators(proposalId);
  }

  /**
   * GET /proposals/:id/all-members
   * Fetch all members grouped by role
   * No permission check required (read-only)
   */
  @Get(':id/all-members')
  async getAllMembersGrouped(
    @Param('id', new ParseUUIDPipe()) proposalId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.proposalMembersService.getAllMembersGrouped(proposalId);
  }
}

// {
//   "header": {
//     "Authorization": "Bearer <JWT_TOKEN>"
//   },
//   "body": {
//     /* 1. Proposal Identity (The "proposals" table) */
//     "title": "Integrated Pest Management for Sustainable Coffee",
//     "abstract": "This research focuses on biological control methods...",
//     "proposalType": "Postgraduate",   // Trigger for routing_rules (UG, PG, Funded, etc.)
//     "degreeLevel": "Master",          // Required ENUM for PG tracks
//     "researchArea": "Plant Sciences", // For categorization
//     "advisorUserId": "optional-uuid", // Optional requested advisor
//     "durationMonths": 18,             // Required for the 'projects' table later

//     /* 2. Budget Relation (The "budget_requests" & "items" tables) */
//     "budget": [
//       { "description": "Laboratory Reagents", "amount": 2500.00 },
//       { "description": "Field Site Rent", "amount": 1000.00 },
//       { "description": "Local Transport", "amount": 400.00 },
//       { "description": "Documentation & VAT", "amount": 150.00 }
//     ],

//     /* 3. Team Relation (The "collaborators" / "project_members" logic) */
//     "collaborators": [
//       "user-uuid-1",
//       "user-uuid-2",
//       "user-uuid-3"
//     ],

//     /* 4. The File (Handled as multipart) */
//     "file": "proposal_document_binary"
//   }
// }
