import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { UndergradService } from './undergrad.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import { AccessGuard } from 'src/access-control/access.guard';
import { RequirePermission } from 'src/access-control/require-permission.decorator';
import { Permission } from 'src/access-control/permission.enum';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from 'src/auth/decorators/current-user.decorator';
import { DecisionDto } from './dto/decision.dto';
import { AssignAdvisorDto } from './dto/assign-advisor.dto';

/**
 * UndergradController
 *
 * Base route: /undergrad
 *
 * Guard chain (applied to the entire controller):
 *   1. JwtAuthGuard   → validates JWT token, attaches user to request
 *   2. AccessGuard    → checks @RequirePermission() against RolePermissions map
 *
 * All routes here require COORDINATOR_PROPOSALS_VIEW at minimum.
 * Only the COORDINATOR role has this permission → full route isolation.
 */
@Controller('undergrad')
@UseGuards(JwtAuthGuard, AccessGuard)
export class UndergradController {
  constructor(private readonly undergradService: UndergradService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // GET /undergrad/proposals
  // List all Undergraduate proposals the coordinator can review
  //
  // Query params (all optional):
  //   ?status=Submitted   → filter by proposal status
  //   ?search=keyword     → search by title or researcher name
  //
  // Access: COORDINATOR only (COORDINATOR_PROPOSALS_VIEW)
  // ─────────────────────────────────────────────────────────────────────────
  @Get('proposals')
  @RequirePermission(Permission.COORDINATOR_PROPOSALS_VIEW)
  async getProposals(
    @CurrentUser() _user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.undergradService.getProposals({ status, search });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GET /undergrad/proposals/:id
  // Full Level-3 detail view of a single UG proposal
  //
  // Includes: core data, researcher, file versions, budget (header + items),
  //           status history, all approval steps, assigned advisors
  //
  // Access: COORDINATOR only (COORDINATOR_PROPOSALS_VIEW)
  // ─────────────────────────────────────────────────────────────────────────
  @Get('proposals/:id')
  @RequirePermission(Permission.COORDINATOR_PROPOSALS_VIEW)
  async getProposalDetail(
    @CurrentUser() _user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) proposalId: string,
  ) {
    return this.undergradService.getProposalDetail(proposalId);
  }

  // ──────────────────────────────────────────────────────────────────────
  // PATCH /undergrad/proposals/:id/decision
  // Coordinator makes a decision: Accept / Reject / Needs Revision
  //
  // Body (JSON):
  //   { "decision": "Accepted" | "Rejected" | "Needs_Revision",
  //     "comment": "optional text shown to the researcher",
  //     "attachmentFileId": "optional uuid" }
  //
  // What this triggers (in order):
  //   1. proposal_approvals row updated (decision + comment + who + when)
  //   2. proposals.current_status updated
  //   3. proposals.workspace_unlocked = true  (only if Accepted)
  //   4. proposal_status_history row inserted (comment stored as note)
  //   5. notifications row inserted for the researcher
  //   6. audit_logs row inserted
  //
  // Access: COORDINATOR only (COORDINATOR_DECIDE)
  // ──────────────────────────────────────────────────────────────────────
  @Patch('proposals/:id/decision')
  @RequirePermission(Permission.COORDINATOR_DECIDE)
  async makeDecision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) proposalId: string,
    @Body() dto: DecisionDto,
  ) {
    return this.undergradService.makeDecision(user, proposalId, dto);
  }

  // ──────────────────────────────────────────────────────────────────────
  // GET /undergrad/advisors
  // List all active users with the ADVISOR role.
  // The coordinator sees this list and picks one to assign.
  //
  // Access: COORDINATOR only (COORDINATOR_PROPOSALS_VIEW)
  // ──────────────────────────────────────────────────────────────────────
  @Get('advisors')
  @RequirePermission(Permission.COORDINATOR_PROPOSALS_VIEW)
  async getAdvisors(@CurrentUser() _user: AuthenticatedUser) {
    return this.undergradService.getAdvisors();
  }

  // ──────────────────────────────────────────────────────────────────────
  // POST /undergrad/proposals/:id/assign-evaluator
  // Coordinator selects an advisor from the list and assigns them.
  //
  // Body (JSON):
  //   { "advisorUserId": "uuid", "dueDate": "2026-04-15" (optional) }
  //
  // What this triggers (in order):
  //   1. evaluator_assignments row inserted
  //   2. proposals.advisor_user_id updated ← advisor now linked to proposal
  //   3. Notification sent to the advisor
  //   4. Audit log (EVALUATOR_ASSIGNED)
  //
  // Access: COORDINATOR only (COORDINATOR_ASSIGN)
  // ──────────────────────────────────────────────────────────────────────
  @Post('proposals/:id/assign-evaluator')
  @RequirePermission(Permission.COORDINATOR_ASSIGN)
  async assignEvaluator(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) proposalId: string,
    @Body() dto: AssignAdvisorDto,
  ) {
    return this.undergradService.assignAdvisor(user, proposalId, dto);
  }
}
