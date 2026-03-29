import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UndergradRepository } from './undergrad.repository';
import { DecisionDto, CoordinatorDecision } from './dto/decision.dto';
import { AssignAdvisorDto } from './dto/assign-advisor.dto';

/**
 * UndergradService
 *
 * SINGLE RESPONSIBILITY: Business logic for the UG coordinator flow.
 * Never imports DrizzleService or touches DB directly — all data
 * comes through UndergradRepository.
 */
@Injectable()
export class UndergradService {
  constructor(private readonly repo: UndergradRepository) {}

  // ─────────────────────────────────────────────────────────────────────────
  // LIST: All UG proposals (filterable by status + searchable by name/title)
  // ─────────────────────────────────────────────────────────────────────────

  async getProposals(filters: { status?: string; search?: string }) {
    const proposals = await this.repo.findAllUGProposals(filters);

    // Shape the response — coordinator sees a clean summary per proposal
    return {
      count: proposals.length,
      proposals: proposals.map((p) => ({
        id: p.id,
        title: p.title,
        researchArea: p.researchArea,
        durationMonths: p.durationMonths,
        currentStatus: p.currentStatus,
        submittedAt: p.submittedAt,
        workspaceUnlocked: p.workspaceUnlocked,
        researcher: {
          id: p.researcherId,
          name: p.researcherName,
          email: p.researcherEmail,
          department: p.researcherDepartment,
        },
        coordinatorApproval: {
          id: p.approvalId,
          decision: p.approvalDecision,
          comment: p.approvalComment,
          decidedAt: p.approvalDecisionAt,
          decidedByUserId: p.approverUserId,
        },
        budget: {
          totalRequested: p.totalBudget,
        },
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DETAIL: Full Level-3 view of one UG proposal
  // ─────────────────────────────────────────────────────────────────────────

  async getProposalDetail(proposalId: string) {
    const proposal = await this.repo.findOneUGProposal(proposalId);

    // Business rule: if not found or not a UG proposal → 404
    if (!proposal) {
      throw new NotFoundException(
        `Undergraduate proposal with ID "${proposalId}" was not found.`,
      );
    }

    return proposal;
  }

  // ──────────────────────────────────────────────────────────────────────
  // DECISION: Accept / Reject / Needs Revision
  // ──────────────────────────────────────────────────────────────────────

  async makeDecision(
    coordinator: { id: string; fullName?: string },
    proposalId: string,
    dto: DecisionDto,
  ) {
    // ── Guard 1: Proposal exists and is UG ──────────────────────────
    const proposal = await this.repo.findUGProposalBasic(proposalId);
    if (!proposal) {
      throw new NotFoundException(
        `Undergraduate proposal "${proposalId}" was not found.`,
      );
    }

    // ── Guard 2: Coordinator approval row is still Pending ──────────
    // Prevents a coordinator from deciding on an already-decided proposal
    const pendingApproval =
      await this.repo.findPendingCoordinatorApproval(proposalId);
    if (!pendingApproval) {
      throw new ConflictException(
        `This proposal has already been reviewed by a coordinator. ` +
          `Check the approval history for the recorded decision.`,
      );
    }

    // ── Map decision → new proposal status ─────────────────────────
    // COORDINATOR is is_final=true for UG, so Accept = fully Approved
    // and workspace gets unlocked immediately.
    const statusMap: Record<
      CoordinatorDecision,
      {
        newStatus: 'Approved' | 'Rejected' | 'Needs_Revision';
        unlockWorkspace: boolean;
        notificationType: 'Decision' | 'Revision_Required';
      }
    > = {
      [CoordinatorDecision.Accepted]: {
        newStatus: 'Approved',
        unlockWorkspace: true, // ← is_final = true
        notificationType: 'Decision',
      },
      [CoordinatorDecision.Rejected]: {
        newStatus: 'Rejected',
        unlockWorkspace: false,
        notificationType: 'Decision',
      },
      [CoordinatorDecision.Needs_Revision]: {
        newStatus: 'Needs_Revision',
        unlockWorkspace: false,
        notificationType: 'Revision_Required',
      },
    };

    const { newStatus, unlockWorkspace, notificationType } =
      statusMap[dto.decision];

    // ── Build human-readable notification body ───────────────────────
    // The comment (if provided) is embedded here so the researcher
    // reads BOTH the decision AND the reason in their notification bell.
    const notificationBody = dto.comment
      ? `Your proposal "${proposal.title}" has been ${dto.decision} by the Coordinator.\n\nCoordinator note: ${dto.comment}`
      : `Your proposal "${proposal.title}" has been ${dto.decision} by the Coordinator.`;

    // ── Execute all writes (order matters) ──────────────────────────
    // 1. Stamp the approval row — stores decision + comment + who decided
    await this.repo.updateApprovalDecision(pendingApproval.id, {
      decision: dto.decision,
      approverUserId: coordinator.id,
      comment: dto.comment,
      attachmentFileId: dto.attachmentFileId,
    });

    // 2. Update the master proposal status (+ workspace flag if Accepted)
    await this.repo.updateProposalStatus(proposalId, {
      newStatus,
      unlockWorkspace,
    });

    // 3. Append status history so researcher sees the full audit trail
    //    with the coordinator's comment stored as the `note` field
    await this.repo.insertStatusHistory({
      proposalId,
      oldStatus: proposal.currentStatus!,
      newStatus,
      changedBy: coordinator.id,
      note: dto.comment, // ← researcher reads this in the history view
    });

    // 4. Notify the researcher (bell icon + email trigger)
    await this.repo.insertNotification({
      recipientUserId: proposal.createdBy,
      senderUserId: coordinator.id,
      type: notificationType,
      title: `Proposal ${dto.decision}`,
      body: notificationBody,
      proposalId,
    });

    // 5. Compliance audit log
    await this.repo.insertAuditLog({
      actorUserId: coordinator.id,
      entityId: pendingApproval.id,
      metadata: {
        proposalId,
        proposalTitle: proposal.title,
        decision: dto.decision,
        newStatus,
        workspaceUnlocked: unlockWorkspace,
        commentProvided: !!dto.comment,
      },
    });

    return {
      proposalId,
      decision: dto.decision,
      newStatus,
      workspaceUnlocked: unlockWorkspace,
      comment: dto.comment ?? null,
      decidedAt: new Date().toISOString(),
      message: `Proposal successfully ${dto.decision}. Researcher has been notified.`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ADVISORS: List + Assign
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Return all active users with the ADVISOR role.
   * The coordinator uses this list to pick from a dropdown/table in the UI.
   */
  async getAdvisors() {
    const advisors = await this.repo.findAllAdvisors();
    return {
      count: advisors.length,
      advisors,
    };
  }

  /**
   * Assign a selected advisor to a UG proposal.
   *
   * Business rules enforced here (not in repo):
   *   1. Proposal must exist and be a UG type
   *   2. Target user must have the ADVISOR role and be active
   *   3. Same advisor cannot be assigned to the same proposal twice
   *
   * DB writes (in order):
   *   1. Insert evaluator_assignments row  ← formal assignment record
   *   2. Update proposals.advisor_user_id  ← stamps advisor on the proposal
   *   3. Insert notification for the advisor
   *   4. Insert audit log (EVALUATOR_ASSIGNED)
   */
  async assignAdvisor(
    coordinator: { id: string; fullName?: string },
    proposalId: string,
    dto: AssignAdvisorDto,
  ) {
    // ── Guard 1: Proposal exists and is UG ──────────────────────────
    const proposal = await this.repo.findUGProposalBasic(proposalId);
    if (!proposal) {
      throw new NotFoundException(
        `Undergraduate proposal "${proposalId}" was not found.`,
      );
    }

    // ── Guard 2: Target user is a valid active ADVISOR ───────────────
    const advisor = await this.repo.findAdvisorById(dto.advisorUserId);
    if (!advisor) {
      throw new BadRequestException(
        `User "${dto.advisorUserId}" is not an active ADVISOR. ` +
          `Only users with the ADVISOR role can be assigned to proposals.`,
      );
    }

    // ── Guard 3: No duplicate assignment ────────────────────────────
    const existing = await this.repo.findExistingAssignment(
      proposalId,
      dto.advisorUserId,
    );
    if (existing) {
      throw new ConflictException(
        `Advisor "${advisor.fullName}" is already assigned to this proposal.`,
      );
    }

    // ── Write 1: Insert the assignment record ────────────────────────
    const assignment = await this.repo.insertEvaluatorAssignment({
      proposalId,
      advisorUserId: dto.advisorUserId,
      assignedBy: coordinator.id,
      dueDate: dto.dueDate,
    });

    // ── Write 2: Add advisor to proposal members ────────────────────────
    // This makes the advisor visible in every proposal read via proposal_members
    await this.repo.addProposalMember(proposalId, dto.advisorUserId, 'ADVISOR');

    // ── Write 3: Notify the advisor ──────────────────────────────────
    const notificationBody = dto.dueDate
      ? `You have been assigned as advisor for proposal "${proposal.title}". Due date: ${dto.dueDate}.`
      : `You have been assigned as advisor for proposal "${proposal.title}".`;

    await this.repo.insertNotification({
      recipientUserId: dto.advisorUserId,
      senderUserId: coordinator.id,
      type: 'Assigned',
      title: 'New Proposal Assignment',
      body: notificationBody,
      proposalId,
    });

    // ── Write 4: Audit log ───────────────────────────────────────────
    await this.repo.insertAuditLogAction({
      actorUserId: coordinator.id,
      action: 'EVALUATOR_ASSIGNED',
      entityType: 'evaluator_assignments',
      entityId: assignment.id,
      metadata: {
        proposalId,
        proposalTitle: proposal.title,
        advisorId: dto.advisorUserId,
        advisorName: advisor.fullName,
        assignedBy: coordinator.id,
        dueDate: dto.dueDate ?? null,
      },
    });

    return {
      assignmentId: assignment.id,
      proposalId,
      proposalTitle: proposal.title,
      advisor: {
        id: advisor.id,
        name: advisor.fullName,
        email: advisor.email,
        department: advisor.department,
      },
      assignedAt: assignment.assignedAt,
      dueDate: dto.dueDate ?? null,
      message: `Advisor "${advisor.fullName}" successfully assigned. They have been notified.`,
    };
  }
}
