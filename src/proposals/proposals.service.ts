import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { DrizzleService } from 'src/db/db.service';
import { ProposalsRepository } from './proposals.repository';
import { UsersService } from 'src/users/users.service';
import { WorkflowService } from './workflow.service';
import {
  PendingApprovalDto,
  ProposalListItemDto,
} from './dto/proposal-list.dto';
import { ApproverResolution } from './types/proposal';
import { AuthenticatedUser } from 'src/auth/decorators/current-user.decorator';
import { ProposalMemberRole } from './dto/proposal-members.dto';

@Injectable()
export class ProposalsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly repository: ProposalsRepository,
    private readonly usersService: UsersService,
    private readonly workflowService: WorkflowService,
  ) {}
  async create(
    user: AuthenticatedUser,
    dto: CreateProposalDto,
    file: Express.Multer.File,
    shouldSubmit: boolean = false,
  ) {
    // 0. Validate members structure (PI and MEMBER roles only)
    const memberValidation = this.validateMembers(user.id, dto.members);
    if (!memberValidation.valid) {
      throw new BadRequestException(memberValidation.error);
    }

    // 0a. Validate all member users exist
    const memberUserIds = dto.members.map((m) => m.userId);
    const userExistValidation = await this.validateMembersExist(memberUserIds);
    if (!userExistValidation.valid) {
      throw new NotFoundException(userExistValidation.error);
    }

    // 0b. Validate supervisor (advisorUserId) if provided
    let supervisorMember: { userId: string; role: string } | null = null;
    if (dto.advisorUserId) {
      // Check supervisor exists
      const advisorExists = await this.repository.validateUsersExist([
        dto.advisorUserId,
      ]);
      if (advisorExists.length === 0) {
        throw new NotFoundException(
          `Supervisor with ID "${dto.advisorUserId}" does not exist.`,
        );
      }
      // Check supervisor has SUPERVISOR role
      const hasSupervisorRole = await this.repository.filterUsersByRole(
        [dto.advisorUserId],
        'SUPERVISOR',
      );
      if (hasSupervisorRole.length === 0) {
        throw new BadRequestException(
          `User "${dto.advisorUserId}" does not have SUPERVISOR role.`,
        );
      }
      supervisorMember = { userId: dto.advisorUserId, role: 'SUPERVISOR' };
    }

    // 1. Validate department exists if departmentId is provided
    if (dto.departmentId) {
      const departmentExists = await this.repository.departmentExists(
        dto.departmentId,
      );
      if (!departmentExists) {
        throw new NotFoundException(
          `Department with ID "${dto.departmentId}" does not exist.`,
        );
      }
    }

    // 2. Create proposal (independent transaction)
    const proposal = await this.drizzle.db.transaction(async (tx) => {
      // 2.1 Create master proposal
      const created = await this.repository.createProposal(tx, {
        createdBy: user.id,
        title: dto.title,
        abstract: dto.abstract,
        proposalProgram: dto.proposalProgram as any,
        isFunded: dto.isFunded || false,
        degreeLevel: (dto.degreeLevel || 'NA') as any,
        researchArea: dto.researchArea,
        durationMonths: dto.durationMonths,
        departmentId: dto.departmentId,
      });

      // 2.2 Add proposal members (PI/MEMBER from members array + SUPERVISOR from advisorUserId)
      const allMembers =
        supervisorMember !== null
          ? ([...dto.members, supervisorMember] as Array<{
              userId: string;
              role: string;
            }>)
          : (dto.members as unknown as Array<{
              userId: string;
              role: string;
            }>);
      await this.repository.addProposalMembers(
        tx,
        created.id,
        allMembers as Array<{ userId: string; role: ProposalMemberRole }>,
      );

      // 2.3 Create file metadata
      const proposalFile = await this.repository.createProposalFile(tx, {
        proposalId: created.id,
        uploadedBy: user.id,
        fileName: file.originalname,
        filePath: `proposals/${Date.now()}_${file.originalname}`,
        fileType: file.mimetype,
        fileSize: file.size,
      });

      // 2.4 Create version snapshot
      await this.repository.createProposalVersion(tx, {
        proposalId: created.id,
        createdBy: user.id,
        fileId: proposalFile.id,
        collaborators: dto.collaborators,
      });

      // 2.5 Create budget request and items
      await this.repository.createBudgetRequest(tx, {
        proposalId: created.id,
        requestedBy: user.id,
        items: dto.budget,
      });

      // 2.6 Audit log
      await this.repository.createAuditLog(tx, {
        actorUserId: user.id,
        action: 'CREATED',
        entityType: 'proposals',
        entityId: created.id,
        metadata: {
          title: created.title,
          program: created.proposalProgram,
        },
      });

      return created;
    });

    // 2. Optional: Submit proposal in separate transaction
    let submissionError: string | null = null;

    if (shouldSubmit) {
      try {
        await this.workflowService.submitProposal(proposal.id, user.id);
      } catch (error) {
        submissionError =
          error instanceof Error ? error.message : 'Submission failed';
      }
    }

    return {
      proposal: {
        id: proposal.id,
        title: proposal.title,
        status: shouldSubmit && !submissionError ? 'Under_Review' : 'Draft',
      },
      submitted: shouldSubmit && !submissionError,
      submissionError,
    };
  }

  /**
   * Get proposals where user is involved (creator or member)
   * Includes current active step and user's role if applicable
   */
  async getMyProposals(userId: string): Promise<ProposalListItemDto[]> {
    // 1. Fetch proposals by creator
    const createdProposals =
      await this.repository.findProposalsByCreator(userId);

    // 2. Fetch proposals by membership
    const membershipRecords =
      await this.repository.findProposalsByMembership(userId);
    const memberProposals = membershipRecords.map((r: any) => r.proposal);

    // 3. Deduplicate (if user is both creator and member, show once)
    const proposalMap = new Map();
    createdProposals.forEach((p: any) => proposalMap.set(p.id, p));
    memberProposals.forEach((p: any) => {
      if (!proposalMap.has(p.id)) {
        proposalMap.set(p.id, p);
      }
    });

    // 4. Enrich each proposal with active step and user role
    const enriched = await Promise.all(
      Array.from(proposalMap.values()).map(async (proposal: any) => {
        // Get creator info
        const creator = await this.usersService.findOne(proposal.createdBy);

        // Get active step if exists
        const activeStep = await this.repository.getActiveStepForProposal(
          proposal.id,
        );

        // Get user's role (if member)
        let userRole: string | undefined = undefined;
        if (proposal.createdBy !== userId) {
          const memberRecords = membershipRecords.find(
            (r: any) => r.proposal.id === proposal.id,
          );
          if (memberRecords?.membership) {
            userRole = memberRecords.membership.role;
          }
        }

        return {
          id: proposal.id,
          title: proposal.title,
          abstract: proposal.abstract,
          proposalProgram: proposal.proposalProgram,
          isFunded: proposal.isFunded,
          currentStatus: proposal.currentStatus,
          submittedAt: proposal.submittedAt?.toISOString(),
          createdAt:
            proposal.createdAt?.toISOString() || new Date().toISOString(),
          createdBy: proposal.createdBy,
          createdByName: creator?.fullName,
          currentStepOrder: activeStep?.stepOrder,
          currentApproverRole: activeStep?.approverRole,
          userRole: userRole || undefined,
        } as ProposalListItemDto;
      }),
    );

    return enriched;
  }

  /**
   * Get proposals pending user's approval (actionable items)
   * Query ONLY active pending steps: is_active = true AND decision = 'Pending'
   * Trust is_active as source of truth
   */
  async getPendingApprovals(
    user: AuthenticatedUser,
  ): Promise<PendingApprovalDto[]> {
    // 1. Fetch all proposals with active pending approval steps
    const proposalsWithSteps =
      await this.repository.findProposalsWithActivePendingSteps();

    console.log(proposalsWithSteps);

    if (proposalsWithSteps.length === 0) {
      return [];
    }

    // 2. Get user's roles (guaranteed non-null from repository)
    const userRoles = await this.usersService.getUserRoles(user.id);
    const roleNames = userRoles
      .map((ur) => ur.roleName)
      .filter((r): r is string => r !== null);

    // 3. Filter: only proposals where user can approve
    const pendingForUser: PendingApprovalDto[] = [];

    for (const item of proposalsWithSteps) {
      const proposal = item.proposal;
      const activeStep = item.activeStep;

      // Skip if user already made a decision on this step (shouldn't happen, but safe check)
      if (activeStep.approverUserId === user.id) {
        continue;
      }

      // Check if user can approve this step
      const resolution = await this.resolveApprover(
        user,
        proposal,
        activeStep.approverRole,
        roleNames,
      );
      console.log(resolution);

      if (!resolution.canApprove) {
        continue;
      }

      // 4. Build DTO for actionable proposal
      const dto: PendingApprovalDto = {
        id: proposal.id,
        title: proposal.title,
        abstract: proposal.abstract || undefined,
        proposalProgram: proposal.proposalProgram,
        isFunded: proposal.isFunded ?? false,
        currentStatus: proposal.currentStatus || 'Under_Review',
        submittedAt: proposal.submittedAt?.toISOString(),
        createdAt:
          proposal.createdAt?.toISOString() || new Date().toISOString(),
        createdBy: proposal.createdBy,
        currentStepOrder: activeStep.stepOrder,
        currentApproverRole: activeStep.approverRole,
        stepLabel: `Step ${activeStep.stepOrder}`,
        projectId: proposal.projectId || undefined,
      };

      pendingForUser.push(dto);
    }

    return pendingForUser;
  }

  /**
   * Helper: Resolve if user can approve at current step
   * Centralized role validation with department context for COORDINATOR
   */
  private async resolveApprover(
    user: AuthenticatedUser,
    proposal: any,
    requiredRole: string,
    userRoles: string[],
  ): Promise<ApproverResolution> {
    // Check if user has the required role
    if (!userRoles.includes(requiredRole)) {
      return {
        canApprove: false,
        reason: `User does not have required role: ${requiredRole}`,
      };
    }

    // COORDINATOR requires department verification
    if (requiredRole === 'COORDINATOR') {
      // GENERAL proposals (no department) cannot be approved by COORDINATOR
      if (!proposal.departmentId) {
        return {
          canApprove: false,
          reason:
            'Proposal not linked to a department (GENERAL proposals cannot be approved by COORDINATOR)',
        };
      }

      const isCoord = await this.usersService.isCoordinatorOfDepartment(
        user.id,
        proposal.departmentId,
      );

      if (!isCoord) {
        return {
          canApprove: false,
          reason: 'User is not coordinator of this department',
        };
      }
    }

    return { canApprove: true };
  }

  // ─── Helper Methods: Member Validation ─────────────

  /**
   * Validate proposal members array (PI and MEMBER roles only)
   * Ensures: at least one member, exactly one PI, creator is included
   */
  private validateMembers(
    creatorId: string,
    members: Array<{ userId: string; role: string }>,
  ): { valid: boolean; error?: string } {
    // Check at least one member
    if (!members || members.length === 0) {
      return { valid: false, error: 'At least one member is required' };
    }

    // Check exactly one PI
    const piCount = members.filter((m) => m.role === 'PI').length;
    if (piCount === 0) {
      return {
        valid: false,
        error: 'Exactly one member must be assigned as PI',
      };
    }
    if (piCount > 1) {
      return { valid: false, error: 'Only one member can be assigned as PI' };
    }

    // Check creator is included
    const creatorMember = members.find((m) => m.userId === creatorId);
    if (!creatorMember) {
      return { valid: false, error: 'Creator must be included in members' };
    }

    return { valid: true };
  }

  /**
   * Validate that all users exist in the system
   */
  private async validateMembersExist(userIds: string[]): Promise<{
    valid: boolean;
    error?: string;
    missingIds?: string[];
  }> {
    const foundIds = await this.repository.validateUsersExist(userIds);
    const missingIds = userIds.filter((id) => !foundIds.includes(id));

    if (missingIds.length > 0) {
      return {
        valid: false,
        error: `Users not found: ${missingIds.join(', ')}`,
        missingIds,
      };
    }

    return { valid: true };
  }
}
