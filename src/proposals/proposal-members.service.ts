import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import { ProposalsRepository } from './proposals.repository';
import { ProposalMemberRole } from './dto/proposal-member.dto';

/**
 * ProposalMembersService
 * Handles all member management operations for proposals
 * - Adding/removing members (bulk operations)
 * - Assigning advisors (single, replaces existing)
 * - Assigning evaluators (multiple allowed)
 *
 * Orchestrates business logic and delegates DB operations to ProposalsRepository
 */
@Injectable()
export class ProposalMembersService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly repository: ProposalsRepository,
  ) {}

  /**
   * Add members to a proposal
   * Handles duplicate filtering and role constraint validation
   * Defaults new members to MEMBER role
   * One user can only have ONE role per proposal
   *
   * @param proposalId - Proposal ID
   * @param newMembers - Array of {userId} (role defaults to MEMBER)
   * @returns Object with count of added members and details
   */
  async addMembers(
    proposalId: string,
    newMembers: Array<{ userId: string }>,
  ): Promise<{ added: number; skipped: number; errors?: string[] }> {
    // 1. Verify proposal exists
    const proposal = await this.repository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException(`Proposal with ID "${proposalId}" not found`);
    }

    // 2. Get ALL existing members (any role) - enforce one role per user
    const existingMembers =
      await this.repository.getProposalMembers(proposalId);
    const existingUserIds = new Set(existingMembers.map((m) => m.userId));

    // 3. Filter out users that already have ANY role
    const uniqueNewMembers = newMembers.filter(
      (m) => !existingUserIds.has(m.userId),
    );

    const duplicateErrors = newMembers
      .filter((m) => existingUserIds.has(m.userId))
      .map((m) => {
        const existingRole = existingMembers.find(
          (em) => em.userId === m.userId,
        );
        return `User ${m.userId} already has role ${existingRole?.role || 'UNKNOWN'}`;
      });

    if (uniqueNewMembers.length === 0) {
      if (duplicateErrors.length > 0) {
        throw new BadRequestException(
          `Cannot add members. Issues: ${duplicateErrors.join(', ')}`,
        );
      }
      return { added: 0, skipped: newMembers.length };
    }

    // 4. Verify all users exist
    const userIds = uniqueNewMembers.map((m) => m.userId);
    const foundIds = await this.repository.validateUsersExist(userIds);
    const missingIds = userIds.filter((id) => !foundIds.includes(id));

    if (missingIds.length > 0) {
      if (duplicateErrors.length > 0) {
        throw new BadRequestException(
          `Cannot add members. Issues: ${[...duplicateErrors, ...missingIds.map(id => `User ${id} not found`)].join(', ')}`,
        );
      }
      throw new NotFoundException(`Users not found: ${missingIds.join(', ')}`);
    }

    // 5. Add valid members (all uniqueNewMembers at this point are valid)
    const validMembers = uniqueNewMembers.map((m) => ({
      userId: m.userId,
      role: ProposalMemberRole.MEMBER,
    }));

    await this.repository.addProposalMembers(
      this.drizzle.db,
      proposalId,
      validMembers,
    );

    return {
      added: validMembers.length,
      skipped: newMembers.length - validMembers.length,
      errors: duplicateErrors.length > 0 ? duplicateErrors : undefined,
    };
  }

  /**
   * Remove members from a proposal
   *
   * @param proposalId - Proposal ID
   * @param userIds - Array of user IDs to remove
   * @returns Count of removed members
   */
  async removeMembers(
    proposalId: string,
    userIds: string[],
  ): Promise<{ removed: number }> {
    // 1. Verify proposal exists
    const proposal = await this.repository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException(`Proposal with ID "${proposalId}" not found`);
    }

    // 2. Validate input
    if (userIds.length === 0) {
      throw new BadRequestException('No user IDs provided for removal');
    }

    // 3. Remove members
    const removed = await this.repository.removeMembersByIds(
      proposalId,
      userIds,
    );

    if (removed === 0) {
      throw new BadRequestException('No matching members found to remove');
    }

    return { removed };
  }

  /**
   * Assign a single advisor to a proposal
   * Only one advisor per proposal; new assignment replaces existing
   * One user can only have ONE role per proposal
   *
   * @param proposalId - Proposal ID
   * @param userId - User ID to assign as advisor
   * @returns Success response
   */
  async assignAdvisor(
    proposalId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    // 1. Verify proposal exists
    const proposal = await this.repository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException(`Proposal with ID "${proposalId}" not found`);
    }

    // 2. Verify user exists
    const foundIds = await this.repository.validateUsersExist([userId]);
    if (foundIds.length === 0) {
      throw new NotFoundException(`User with ID "${userId}" not found`);
    }

    // 3. Check if user already has ANY other role (enforce one role per user)
    const existingMembers =
      await this.repository.getProposalMembers(proposalId);
    const existingRole = existingMembers.find((m) => m.userId === userId);

    if (existingRole && existingRole.role !== ProposalMemberRole.ADVISOR) {
      throw new BadRequestException(
        `User ${userId} already has role ${existingRole.role}. One user can only have one role per proposal.`,
      );
    }

    // 4. Clear existing advisor(s)
    await this.repository.clearMembersWithRole(
      proposalId,
      ProposalMemberRole.ADVISOR,
    );

    // 4. Assign new advisor
    await this.repository.addProposalMembers(this.drizzle.db, proposalId, [
      { userId, role: ProposalMemberRole.ADVISOR },
    ]);

    return {
      success: true,
      message: `Advisor assigned successfully`,
    };
  }

  /**
   * Assign evaluators to a proposal
   * Multiple evaluators allowed; adds to existing
   * One user can only have ONE role per proposal (cannot be both EVALUATOR and MEMBER, etc)
   *
   * @param proposalId - Proposal ID
   * @param userIds - Array of user IDs to assign as evaluators
   * @returns Response with count added
   */
  async assignEvaluators(
    proposalId: string,
    userIds: string[],
  ): Promise<{ added: number; skipped: number }> {
    // 1. Verify proposal exists
    const proposal = await this.repository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException(`Proposal with ID "${proposalId}" not found`);
    }

    // 2. Get ALL existing members to check for cross-role conflicts
    const allExistingMembers =
      await this.repository.getProposalMembers(proposalId);
    const existingEvaluatorIds = new Set(
      allExistingMembers
        .filter((m) => m.role === ProposalMemberRole.EVALUATOR)
        .map((m) => m.userId),
    );

    // 3. Filter out users already assigned as evaluators
    const newEvaluators = userIds.filter((id) => !existingEvaluatorIds.has(id));

    // 4. Check if any new evaluators have a different role already
    const crossRoleConflicts = newEvaluators.filter((id) =>
      allExistingMembers.find(
        (m) => m.userId === id && m.role !== ProposalMemberRole.EVALUATOR,
      ),
    );

    if (crossRoleConflicts.length > 0) {
      const conflicts = crossRoleConflicts
        .map((id) => {
          const member = allExistingMembers.find((m) => m.userId === id);
          return `User ${id} already has role ${member?.role}`;
        })
        .join(', ');
      throw new BadRequestException(
        `Cannot assign evaluators. Issues: ${conflicts}. One user can only have one role per proposal.`,
      );
    }

    if (newEvaluators.length === 0) {
      return { added: 0, skipped: userIds.length };
    }

    // 3. Verify all users exist
    const foundIds = await this.repository.validateUsersExist(newEvaluators);
    const missingIds = newEvaluators.filter((id) => !foundIds.includes(id));

    if (missingIds.length > 0) {
      throw new NotFoundException(`Users not found: ${missingIds.join(', ')}`);
    }

    // 4. Add new evaluators
    const evaluatorMembers: Array<{
      userId: string;
      role: ProposalMemberRole;
    }> = newEvaluators.map((userId) => ({
      userId,
      role: ProposalMemberRole.EVALUATOR,
    }));

    await this.repository.addProposalMembers(
      this.drizzle.db,
      proposalId,
      evaluatorMembers,
    );

    return {
      added: newEvaluators.length,
      skipped: userIds.length - newEvaluators.length,
    };
  }

  /**
   * Get core members (PI + MEMBER roles)
   *
   * @param proposalId Proposal ID
   * @returns Array of PI and MEMBER members with user details
   */
  async getCoreMembers(proposalId: string) {
    // Verify proposal exists
    const proposal = await this.repository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException(`Proposal with ID "${proposalId}" not found`);
    }

    return this.repository.getMembersByRoles(proposalId, [
      ProposalMemberRole.PI,
      ProposalMemberRole.MEMBER,
    ]);
  }

  /**
   * Get advisors (ADVISOR role)
   *
   * @param proposalId Proposal ID
   * @returns Array of ADVISOR members with user details
   */
  async getAdvisors(proposalId: string) {
    // Verify proposal exists
    const proposal = await this.repository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException(`Proposal with ID "${proposalId}" not found`);
    }

    return this.repository.getMembersByRoles(proposalId, [
      ProposalMemberRole.ADVISOR,
    ]);
  }

  /**
   * Get evaluators (EVALUATOR role)
   *
   * @param proposalId Proposal ID
   * @returns Array of EVALUATOR members with user details
   */
  async getEvaluators(proposalId: string) {
    // Verify proposal exists
    const proposal = await this.repository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException(`Proposal with ID "${proposalId}" not found`);
    }

    return this.repository.getMembersByRoles(proposalId, [
      ProposalMemberRole.EVALUATOR,
    ]);
  }

  /**
   * Get all members grouped by role
   * Provides a comprehensive view of proposal membership
   *
   * @param proposalId Proposal ID
   * @returns Object with members grouped by role: { [role]: Member[] }
   */
  async getAllMembersGrouped(
    proposalId: string,
  ): Promise<any[]> {
    // Verify proposal exists
    const proposal = await this.repository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException(`Proposal with ID "${proposalId}" not found`);
    }

    // Fetch all members without role filter and return as flat array
    // Includes: userId, role, user { id, fullName, email, department }
    return this.repository.getMembersByRoles(proposalId);
  }
}
