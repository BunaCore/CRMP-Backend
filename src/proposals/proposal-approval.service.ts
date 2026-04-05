import { Injectable } from '@nestjs/common';
import { ProposalApprovalRepository } from './proposal-approval.repository';

@Injectable()
export class ProposalApprovalService {
  constructor(
    private readonly approvalRepository: ProposalApprovalRepository,
  ) {}

  /**
   * Get active step for a proposal
   * Returns null if no active step exists
   */
  async getActiveStep(proposalId: string) {
    return this.approvalRepository.getActiveStepForProposal(proposalId);
  }

  /**
   * Get all pending approvals for a proposal
   * Returns the first pending step (earliest stepOrder)
   */
  async getFirstPendingStep(proposalId: string) {
    return this.approvalRepository.findFirstPendingApprovalForProposal(
      proposalId,
    );
  }

  /**
   * Check if user has already approved a proposal
   */
  async hasApproved(proposalId: string, userId: string): Promise<boolean> {
    return this.approvalRepository.hasUserAlreadyApproved(proposalId, userId);
  }

  /**
   * Get pending approval at specific step
   */
  async getPendingStep(proposalId: string, stepOrder: number) {
    return this.approvalRepository.findPendingApprovalAtStep(
      proposalId,
      stepOrder,
    );
  }

  /**
   * Get routing rule for next approver
   */
  async getRoutingRule(
    proposalProgram: string,
    currentStatus: string,
    stepOrder: number,
  ) {
    return this.approvalRepository.findRoutingRule(
      proposalProgram,
      currentStatus,
      stepOrder,
    );
  }

  /**
   * Get all proposals with active pending steps
   * Used to fetch actionable items for approvers
   */
  async getProposalsWithActivePendingSteps() {
    return this.approvalRepository.findProposalsWithActivePendingSteps();
  }

  /**
   * Get all approval steps for a single proposal
   * Returns complete workflow history in order
   * Used for proposal detail view to display workflow timeline
   */
  async getProposalApprovals(proposalId: string) {
    return this.approvalRepository.findApprovalsByProposalId(proposalId);
  }

  /**
   * Get proposal with department context
   * Used for coordinator approval validation
   */
  async getProposalWithDepartmentContext(proposalId: string) {
    return this.approvalRepository.findProposalWithDepartment(proposalId);
  }
}
