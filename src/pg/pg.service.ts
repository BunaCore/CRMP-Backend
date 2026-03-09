import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PgRepository } from './pg.repository';
import { PgDecisionDto, PgDecisionAction } from './dto/decision.dto';
import { buildDecisionOutcome } from './utils/decision-utils';

@Injectable()
export class PgService {
  constructor(private readonly repo: PgRepository) {}

  async getProposals(
    user: { role?: string },
    filters: { status?: string; search?: string },
  ) {
    if (!user.role) {
      throw new BadRequestException('User role is required');
    }

    return this.repo.findAllPgProposals(filters, user.role);
  }

  async getProposalDetail(proposalId: string) {
    const proposal = await this.repo.findOnePgProposal(proposalId);
    if (!proposal) {
      throw new NotFoundException(
        `Postgraduate proposal with ID "${proposalId}" was not found.`,
      );
    }

    return proposal;
  }

  async makeDecision(
    actor: { id: string; role?: string; fullName?: string },
    proposalId: string,
    dto: PgDecisionDto,
  ) {
    if (!actor.role) {
      throw new BadRequestException('User role is required');
    }

    const proposal = await this.repo.findPgProposalBasic(proposalId);
    if (!proposal) {
      throw new NotFoundException(
        `Postgraduate proposal "${proposalId}" was not found.`,
      );
    }

    const pendingApproval = await this.repo.findPendingApprovalForRole(
      proposalId,
      actor.role,
    );
    if (!pendingApproval) {
      throw new ConflictException(
        'No pending approval was found for your role on this proposal.',
      );
    }

    const decision = dto.decision;
    const currentStatus = proposal.currentStatus ?? 'Submitted';
    const nextRole = await this.repo.findNextRole({
      proposalType: 'Postgraduate',
      currentStatus,
      actorRole: actor.role,
    });

    const outcome = buildDecisionOutcome(decision, Boolean(nextRole));

    await this.repo.updateApprovalDecision(pendingApproval.id, {
      decision: outcome.approvalDecision,
      approverUserId: actor.id,
      comment: dto.comment,
      attachmentFileId: dto.attachmentFileId,
    });

    await this.repo.updateProposalAndBudgetStatus(proposalId, {
      newStatus: outcome.newStatus,
      unlockWorkspace: outcome.unlockWorkspace,
    });

    await this.repo.insertStatusHistory({
      proposalId,
      oldStatus: currentStatus,
      newStatus: outcome.newStatus,
      changedBy: actor.id,
      note: dto.comment,
    });

    const notificationBody = dto.comment
      ? `Your proposal "${proposal.title}" has been ${decision}.

Reviewer note: ${dto.comment}`
      : `Your proposal "${proposal.title}" has been ${decision}.`;

    await this.repo.insertNotification({
      recipientUserId: proposal.createdBy,
      senderUserId: actor.id,
      type: outcome.notificationType,
      title: `Proposal ${decision}`,
      body: notificationBody,
      proposalId,
      context: {
        actorRole: actor.role,
        nextRole: nextRole ?? null,
        decision,
      },
    });

    await this.repo.insertAuditLog({
      actorUserId: actor.id,
      entityId: pendingApproval.id,
      metadata: {
        proposalId,
        proposalTitle: proposal.title,
        decision,
        newStatus: outcome.newStatus,
        nextRole: nextRole ?? null,
      },
    });

    return {
      proposalId,
      decision,
      newStatus: outcome.newStatus,
      workspaceUnlocked: outcome.unlockWorkspace,
      nextRole: nextRole ?? null,
      message: `Proposal successfully ${decision}.`,
    };
  }
}
