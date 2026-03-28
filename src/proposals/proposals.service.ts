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
            proposalType: dto.proposalType as any,
            degreeLevel: (dto.degreeLevel || 'NA') as any,
            researchArea: dto.researchArea,
            advisorUserId: dto.advisorUserId,
            durationMonths: dto.durationMonths,
            currentStatus: 'Submitted',
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
          where: eq(schema.routingRules.proposalType, dto.proposalType as any),
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
          metadata: { title: proposal.title, type: proposal.proposalType },
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
   * Get all proposals created by the authenticated user
   * Simple ownership-based query
   */
  async getMyProposals(userId: string): Promise<ProposalListItemDto[]> {
    const proposals = await this.repository.findByCreatedBy(userId);

    // Hydrate with creator name
    const enriched = await Promise.all(
      proposals.map(async (p) => {
        const creator = await this.usersService.findOne(p.createdBy);
        return {
          id: p.id,
          title: p.title,
          abstract: p.abstract,
          proposalType: p.proposalType,
          currentStatus: p.currentStatus,
          submittedAt: p.submittedAt?.toISOString(),
          createdAt: p.createdAt?.toISOString(),
          createdBy: p.createdBy,
          createdByName: creator?.fullName,
        } as ProposalListItemDto;
      }),
    );

    return enriched;
  }

  /**
   * Get proposals pending user's approval based on workflow role
   * Dynamic workflow-based query with application-layer filtering
   */
  async getPendingApprovals(user: any): Promise<PendingApprovalDto[]> {
    // 1. Fetch proposals in active workflow states
    const inProgressProposals = await this.repository.findInProgressProposals();

    if (inProgressProposals.length === 0) {
      return [];
    }

    // 2. Fetch user's roles for matching against approverRole
    const userRoles = await this.usersService.getUserRoles(user.id);
    const roleNames = userRoles.map((ur) => ur.roleName);

    // 3. For each proposal, check if user can approve
    const pendingForUser: PendingApprovalDto[] = [];

    for (const proposal of inProgressProposals) {
      // Skip if user already approved this proposal
      const hasApproved = await this.repository.hasUserAlreadyApproved(
        proposal.id,
        user.id,
      );
      if (hasApproved) {
        continue;
      }

      // Get FIRST pending approval (earliest step, dynamic regardless of status)
      const pendingApproval =
        await this.repository.findFirstPendingApprovalForProposal(proposal.id);

      if (!pendingApproval) {
        continue; // No pending steps = workflow complete
      }

      // Check if user matches the approver role requirements
      const resolution = await this.resolveApprover(
        user,
        proposal,
        {
          approverRole: pendingApproval.approverRole,
          stepLabel: 'Review Step',
          stepOrder: pendingApproval.stepOrder,
        },
        roleNames,
      );

      if (!resolution.canApprove) {
        continue; // User cannot approve this at this step
      }

      // 4. Map to DTO and include department context
      const dto: PendingApprovalDto = {
        id: proposal.id,
        title: proposal.title,
        abstract: proposal.abstract || undefined,
        proposalType: proposal.proposalType,
        currentStatus: proposal.currentStatus || 'Draft',
        submittedAt: proposal.submittedAt?.toISOString(),
        createdAt:
          proposal.createdAt?.toISOString() || new Date().toISOString(),
        createdBy: proposal.createdBy,
        currentStepOrder: pendingApproval.stepOrder,
        currentApproverRole: pendingApproval.approverRole,
        stepLabel: 'Review Step',
        projectId: proposal.projectId || undefined,
      };

      // Enrich with department if proposal has project
      if (proposal.projectId) {
        const projectCtx = await this.repository.findProjectWithDepartment(
          proposal.projectId,
        );
        if (projectCtx?.department) {
          dto.departmentName = projectCtx.department.name;
        }
      }

      pendingForUser.push(dto);
    }

    return pendingForUser;
  }

  /**
   * Helper: Resolve if user can approve a proposal at current step
   * Handles role matching with department context for COORDINATOR
   */
  private async resolveApprover(
    user: any,
    proposal: any,
    rule: { approverRole: string; stepLabel?: string; stepOrder?: number },
    userRoleNames: string[],
  ): Promise<ApproverResolution> {
    const { approverRole } = rule;

    // Check if user has the required role
    if (!userRoleNames.includes(approverRole)) {
      return {
        canApprove: false,
        reason: `User does not have role: ${approverRole}`,
      };
    }

    // Special handling for COORDINATOR: must belong to proposal's department
    if (approverRole === 'COORDINATOR') {
      if (!proposal.projectId) {
        return {
          canApprove: false,
          reason: 'Proposal has no project associated',
        };
      }

      const projectCtx = await this.repository.findProjectWithDepartment(
        proposal.projectId,
      );

      if (!projectCtx) {
        return {
          canApprove: false,
          reason: 'Project or department not found',
        };
      }

      // Check if user is a coordinator of this department
      const isCoordinatorOfDept =
        await this.usersService.isCoordinatorOfDepartment(
          user.id,
          projectCtx.departmentId,
        );

      if (!isCoordinatorOfDept) {
        return {
          canApprove: false,
          reason: `User is not coordinator of department: ${projectCtx.department?.name}`,
        };
      }
    }

    // DGC_MEMBER, RAD, etc. - no department restriction, just role
    return { canApprove: true };
  }
}
