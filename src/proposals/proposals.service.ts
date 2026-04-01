import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq } from 'drizzle-orm';
import { ProposalsRepository } from './proposals.repository';
import { UsersService } from 'src/users/users.service';
import {
  PendingApprovalDto,
  ProposalListItemDto,
} from './dto/proposal-list.dto';
import { ApproverResolution } from './types/proposal';

@Injectable()
export class ProposalsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly repository: ProposalsRepository,
    private readonly usersService: UsersService,
  ) {}

  async create(user: any, dto: CreateProposalDto, file: Express.Multer.File) {
    try {
      return await this.drizzle.db.transaction(async (tx) => {
        // 1. Master Proposal: Setup the primary identity
        // Note: We create this first to satisfy the NOT NULL FKs in downstream tables.
        const [proposal] = await tx
          .insert(schema.proposals)
          .values({
            createdBy: user.id,
            title: dto.title,
            abstract: dto.abstract,
            proposalProgram: dto.proposalProgram as any,
            isFunded: dto.isFunded || false,
            degreeLevel: (dto.degreeLevel || 'NA') as any,
            researchArea: dto.researchArea,
            durationMonths: dto.durationMonths,
            departmentId: dto.departmentId,
            currentStatus: 'Draft',
            submittedAt: new Date(),
          })
          .returning();

        // 2. File Metadata: Record the uploaded PDF details
        const [proposalFile] = await tx
          .insert(schema.proposalFiles)
          .values({
            proposalId: proposal.id,
            uploadedBy: user.id,
            fileName: file.originalname,
            filePath: `proposals/${Date.now()}_${file.originalname}`, // Mock path for now
            fileType: file.mimetype,
            fileSize: file.size,
          })
          .returning();

        // 3. Immutability (Versioning): Create V1 Snapshot
        // We store the team (collaborators) in contentJson to preserve history
        const [version] = await tx
          .insert(schema.proposalVersions)
          .values({
            proposalId: proposal.id,
            createdBy: user.id,
            versionNumber: 1,
            isCurrent: true,
            fileId: proposalFile.id,
            contentJson: { collaborators: dto.collaborators || [] },
            changeSummary: 'Initial Submission',
          })
          .returning();

        // Link the proposal back to its current version
        await tx
          .update(schema.proposals)
          .set({ currentVersionId: version.id })
          .where(eq(schema.proposals.id, proposal.id));

        // 4. Financial Record: Budget Header + Bulk Items
        // Senior Logic: Calculate sum and bulk insert items in a single query
        const totalAmount = dto.budget.reduce(
          (sum, item) => sum + Number(item.amount),
          0,
        );
        const [budgetRequest] = await tx
          .insert(schema.budgetRequests)
          .values({
            proposalId: proposal.id,
            requestedBy: user.id,
            currentStatus: 'Submitted' as any,
            totalAmount: totalAmount.toString(),
          })
          .returning();

        if (dto.budget.length > 0) {
          await tx.insert(schema.budgetRequestItems).values(
            dto.budget.map((item, index) => ({
              budgetRequestId: budgetRequest.id,
              lineIndex: index + 1,
              description: item.description,
              requestedAmount: item.amount.toString(),
            })),
          );
        }

        // --- Prompt 3: Workflow Logic (Retained for completeness) ---
        const rules = await tx.query.routingRules.findMany({
          where: eq(
            schema.routingRules.proposalProgram,
            dto.proposalProgram as any,
          ),
          orderBy: (rules, { asc }) => [asc(rules.stepOrder)],
        });

        if (rules.length > 0) {
          await tx.insert(schema.proposalApprovals).values(
            rules.map((rule) => ({
              proposalId: proposal.id,
              routingRuleId: rule.id,
              stepOrder: rule.stepOrder,
              approverRole: rule.approverRole,
              decision: 'Pending' as any,
              versionId: version.id,
            })),
          );
        }

        // 6. Compliance: Audit logging
        await tx.insert(schema.auditLogs).values({
          actorUserId: user.id,
          action: 'CREATED',
          entityType: 'proposals',
          entityId: proposal.id,
          metadata: {
            title: proposal.title,
            program: proposal.proposalProgram,
          },
        });

        return {
          id: proposal.id,
          status: 'Submitted',
          message:
            'Proposal recorded successfully. All relations and budget items synchronized.',
        };
      });
    } catch (error) {
      console.error('Core Transaction Failed:', error);
      throw new InternalServerErrorException(
        'Database synchronization failed during proposal recording.',
      );
    }
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
  async getPendingApprovals(user: any): Promise<PendingApprovalDto[]> {
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
    user: any,
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
}
