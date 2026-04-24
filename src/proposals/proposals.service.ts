import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { DrizzleService } from 'src/db/db.service';
import { ProposalsRepository } from './proposals.repository';
import { ProposalApprovalService } from './proposal-approval.service';
import { UsersService } from 'src/users/users.service';
import { WorkflowService } from './workflow.service';
import { MailService } from 'src/mail/mail.service';
import { EmailType } from 'src/mail/dto/email-type.enum';
import {
  PendingApprovalDto,
  ProposalListItemDto,
} from './dto/proposal-list.dto';
import { ApproverResolution } from './types/proposal';
import { AuthenticatedUser } from 'src/auth/decorators/current-user.decorator';
import { ProposalMemberRole } from './dto/proposal-member.dto';
import { mapProposalToResponse } from './utils/proposal.mapper';
import {
  mapProposalToDetailResponse,
  ProposalDetailResponse,
} from './utils/proposal-detail.mapper';
import { ProposalResponse } from 'src/types/proposal-response.type';
import { GetProposalsQueryDto } from './dto/get-proposals-query.dto';
import { SubmitEvaluationScoresDto } from './dto/evaluation.dto';
import { AbilityFactory } from 'src/access-control/ability.factory';
import {
  buildProposalAuthorizationWhere,
  buildProposalRequestWhere,
  combineWithAnd,
} from './conditions/proposal.condition';
@Injectable()
export class ProposalsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly repository: ProposalsRepository,
    private readonly approvalService: ProposalApprovalService,
    private readonly usersService: UsersService,
    private readonly workflowService: WorkflowService,
    private readonly mailService: MailService,
    private readonly abilityFactory: AbilityFactory,
  ) {}
  async create(
    user: AuthenticatedUser,
    dto: CreateProposalDto,
    // @ts-ignore
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
      // 2.0 Calculate total budget from items
      const totalBudgetAmount = dto.budget.reduce(
        (sum, item) => sum + Number(item.amount || 0),
        0,
      );

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
        budgetAmount: totalBudgetAmount,
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
      console.log(dto.budget);
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
          budgetAmount: totalBudgetAmount,
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
        const activeStep = await this.approvalService.getActiveStep(
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
      await this.approvalService.getProposalsWithActivePendingSteps();

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

    if (pendingForUser.length === 0) {
      return [];
    }

    // 5. Fetch additional context: creators and members
    const proposalIds = pendingForUser.map((p) => p.id);
    const creatorIds = pendingForUser.map((p) => p.createdBy);
    const uniqueCreatorIds = Array.from(new Set(creatorIds));

    const [creators, allMembers] = await Promise.all([
      this.usersService.findByIds(uniqueCreatorIds),
      this.repository.getMembersByProposalIds(proposalIds),
    ]);

    const creatorsMap = new Map(creators.map((c) => [c.id, c.fullName]));

    // Group members by proposal
    const membersByProposal = new Map<string, any[]>();
    for (const m of allMembers) {
      if (!membersByProposal.has(m.proposalId)) {
        membersByProposal.set(m.proposalId, []);
      }
      membersByProposal.get(m.proposalId)!.push(m);
    }

    // Embed data
    for (const dto of pendingForUser) {
      dto.createdByName = creatorsMap.get(dto.createdBy) || 'Unknown';
      const members = membersByProposal.get(dto.id) || [];
      dto.evaluatorAssigned = members.some((m) => m.role === 'EVALUATOR');
      dto.advisorAssigned = members.some((m) => m.role === 'ADVISOR');
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

  /**
   * Get all proposals as frontend-friendly responses
   * Optimized to avoid N+1 queries:
   * - Single query: all proposals + budget
   * - Single query: all members for those proposals
   * - Single query: all users involved
   * - Single query: all departments
   *
   * @returns Array of ProposalResponse
   */
  async getProposals(
    query: GetProposalsQueryDto,
    currentUserId?: string,
  ): Promise<ProposalResponse[]> {
    if (!currentUserId) {
      throw new BadRequestException('currentUserId is required');
    }

    const ability = await this.abilityFactory.createAbility(currentUserId);

    const authWhere = buildProposalAuthorizationWhere(
      this.drizzle.db,
      ability,
      currentUserId,
    );
    const requestWhere = buildProposalRequestWhere(
      this.drizzle.db,
      query,
      currentUserId,
    );

    const where = combineWithAnd([authWhere, requestWhere]);

    // 1. Fetch proposals matching visibility + request filters from repository
    const proposals = await this.repository.getProposals(where, {
      limit: query.limit ?? 10,
      offset: query.getOffset(),
    });

    if (proposals.length === 0) {
      return [];
    }

    const proposalIds = proposals.map((p) => p.id);

    // 2. Fetch all budgets for these proposals (bulk query)
    const budgetsRaw =
      await this.repository.getBudgetsByProposalIds(proposalIds);
    const budgetsMap = new Map(
      budgetsRaw.map((b) => [b.proposalId, b.totalAmount]),
    );

    // 3. Fetch all members for these proposals (bulk query)
    const membersRaw =
      await this.repository.getMembersByProposalIds(proposalIds);

    // 4. Extract unique user IDs and fetch all users in bulk
    const userIds = new Set(membersRaw.map((m) => m.userId));
    const users =
      userIds.size > 0
        ? await this.usersService.findByIds(Array.from(userIds))
        : [];

    // Build users map for O(1) lookup
    const usersMap = new Map(
      users.map((u) => [
        u.id,
        { id: u.id, fullName: u.fullName, email: u.email },
      ]),
    );

    // 5. Fetch departments for these proposals (bulk query)
    const departmentIds = Array.from(
      new Set(proposals.map((p) => p.departmentId).filter((id) => id != null)),
    );
    const departmentMap =
      await this.repository.getDepartmentsByIds(departmentIds);

    // 6. Group members by proposal ID for O(1) lookup
    const membersByProposalId = new Map<string, typeof membersRaw>();

    for (const member of membersRaw) {
      if (!membersByProposalId.has(member.proposalId)) {
        membersByProposalId.set(member.proposalId, []);
      }
      membersByProposalId.get(member.proposalId)!.push(member);
    }

    // 7. Map each proposal to response
    return proposals.map((p) => {
      const members = membersByProposalId.get(p.id) || [];
      const budget = budgetsMap.get(p.id)
        ? parseFloat(budgetsMap.get(p.id)!)
        : undefined;

      return mapProposalToResponse(
        {
          id: p.id,
          title: p.title,
          abstract: p.abstract ?? undefined,
          proposalProgram: p.proposalProgram ?? undefined,
          currentStatus: p.currentStatus ?? undefined,
          submittedAt: p.submittedAt ?? undefined,
          isFunded: p.isFunded ?? false,
          degreeLevel: p.degreeLevel ?? undefined,
          researchArea: p.researchArea ?? undefined,
        },
        members.map((m) => ({
          userId: m.userId,
          role: m.role,
          user: m.user
            ? {
                id: m.user.id,
                fullName: m.user.fullName ?? undefined,
                email: m.user.email,
              }
            : undefined,
        })),
        usersMap,
        departmentMap,
        p.departmentId ?? undefined,
        budget,
      );
    });
  }

  /**
   * Get detailed proposal view by ID
   * Fetches all related data for frontend display
   * Avoids N+1 queries through bulk operations
   *
   * @param proposalId - Proposal ID to fetch
   * @returns ProposalDetailResponse
   */
  async getProposalByIdDetailed(
    proposalId: string,
  ): Promise<ProposalDetailResponse> {
    // 1. Fetch proposal
    const proposal = await this.repository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException(
        `Proposal with ID "${proposalId}" not found.`,
      );
    }

    // 2. Fetch proposal members
    const members = await this.repository.getProposalMembers(proposalId);

    // 3. Extract unique user IDs and fetch users in batch
    const userIds = new Set(members.map((m) => m.userId));
    const users =
      userIds.size > 0
        ? await this.usersService.findByIds(Array.from(userIds))
        : [];

    // Build users map for O(1) lookup
    const usersMap = new Map(
      users.map((u) => [
        u.id,
        { id: u.id, fullName: u.fullName, email: u.email },
      ]),
    );

    // 4. Fetch department if exists
    let department = null;
    if (proposal.departmentId) {
      const deptIds = await this.repository.getDepartmentsByIds([
        proposal.departmentId,
      ]);
      department = deptIds.get(proposal.departmentId);
    }

    // 5. Fetch all approval steps for this proposal (complete workflow history)
    const proposalApprovals =
      await this.approvalService.getProposalApprovals(proposalId);

    // 6. Fetch comments for this proposal
    const comments = await this.repository.getCommentsByProposalId(proposalId);

    // 7. Fetch defence schedules for this proposal
    const defenceSchedules =
      await this.repository.getDefencesByProposalId(proposalId);

    // 8. Fetch budget for this proposal
    const budgetsRaw = await this.repository.getBudgetsByProposalIds([
      proposalId,
    ]);
    const totalBudget =
      budgetsRaw.length > 0 && budgetsRaw[0].totalAmount != null
        ? parseFloat(budgetsRaw[0].totalAmount)
        : null;

    // 9. Fetch budget items for this proposal
    const budgetItems =
      await this.repository.getBudgetItemsByProposalId(proposalId);

    // 10. Map to detailed response
    return mapProposalToDetailResponse(
      proposal,
      members,
      usersMap,
      department,
      proposalApprovals,
      comments,
      defenceSchedules,
      totalBudget,
      budgetItems,
    );
  }

  /**
   * Get all proposals for a specific researcher (by userId)
   * Returns full detail per proposal: members, workflow (with feedback),
   * comments, and defence schedules
   * Access: any authenticated user — results are scoped to proposals
   * where the userId is the creator or a member
   *
   * @param userId - The researcher's user ID
   * @returns Array of ProposalDetailResponse
   */
  async getResearcherProposals(
    userId: string,
  ): Promise<ProposalDetailResponse[]> {
    // 1. Fetch proposals where user is creator
    const createdProposals =
      await this.repository.findProposalsByCreator(userId);

    // 2. Fetch proposals where user is a member
    const membershipRecords =
      await this.repository.findProposalsByMembership(userId);
    const memberProposals = membershipRecords.map((r: any) => r.proposal);

    // 3. Deduplicate (user may be both creator and member)
    const proposalMap = new Map<string, any>();
    createdProposals.forEach((p: any) => proposalMap.set(p.id, p));
    memberProposals.forEach((p: any) => {
      if (!proposalMap.has(p.id)) {
        proposalMap.set(p.id, p);
      }
    });

    if (proposalMap.size === 0) {
      return [];
    }

    // 4. Fetch detailed info for each proposal (includes comments + defences)
    const detailedProposals = await Promise.all(
      Array.from(proposalMap.keys()).map((proposalId) =>
        this.getProposalByIdDetailed(proposalId),
      ),
    );

    return detailedProposals;
  }

  /**
   * Get formatted evaluation overview for a proposal
   */
  async getEvaluationOverview(proposalId: string) {
    const rubrics = await this.repository.getEvaluationRubrics();
    const scores =
      await this.repository.getEvaluationScoresByProposal(proposalId);

    // Group awarded scores by rubric for frontend mapping
    return {
      proposalId,
      rubrics: rubrics.map((rubric) => ({
        id: rubric.id,
        name: rubric.name,
        phase: rubric.phase,
        type: rubric.type,
        maxPoints: parseFloat(rubric.maxPoints as string),
        awardedScores: scores
          .filter((s) => s.rubricId === rubric.id)
          .map((s) => ({
            id: s.id,
            studentId: s.studentId,
            evaluatorId: s.evaluatorId,
            score: parseFloat(s.score as string),
            feedback: s.feedback,
            projectId: s.projectId,
            updatedAt: s.updatedAt,
          })),
      })),
    };
  }

  /**
   * Submit evaluation score
   */
  async submitEvaluationScore(
    proposalId: string,
    evaluatorId: string,
    dto: SubmitEvaluationScoresDto,
  ) {
    // 1. Verify existence of proposal
    const proposal = await this.repository.findById(proposalId);
    if (!proposal) {
      throw new NotFoundException(`Proposal not found`);
    }

    // Guard: reject empty submissions
    if (!dto.scores || dto.scores.length === 0) {
      throw new BadRequestException(
        `No scores provided. Make sure the proposal has members and rubrics loaded before submitting.`,
      );
    }

    // 2. Validate all studentIds are real user IDs (not the proposalId)
    const uniqueStudentIds = Array.from(
      new Set(dto.scores.map((s) => s.studentId)),
    );

    for (const sid of uniqueStudentIds) {
      if (sid === proposalId) {
        throw new BadRequestException(
          `Invalid studentId "${sid}": the proposalId was sent as studentId. Check your frontend payload.`,
        );
      }
    }

    const foundUserIds =
      await this.repository.validateUsersExist(uniqueStudentIds);
    const missingIds = uniqueStudentIds.filter(
      (id) => !foundUserIds.includes(id),
    );
    if (missingIds.length > 0) {
      throw new BadRequestException(
        `Invalid studentId(s): not found in the system: ${missingIds.join(', ')}`,
      );
    }

    console.debug(
      `Upserting ${dto.scores.length} scores for proposal ${proposalId}`,
    );

    // 3. Upsert all scores — one row per (rubricId, proposalId, studentId)
    // ON CONFLICT → update score, feedback, evaluatorId, updatedAt
    const results = await Promise.all(
      dto.scores.map((s) =>
        this.repository.upsertEvaluationScore({
          rubricId: s.rubricId,
          proposalId,
          projectId: s.projectId ?? undefined,
          studentId: s.studentId,
          evaluatorId,
          score: s.score.toString(),
          feedback: s.feedback ?? '',
        }),
      ),
    );
    return {
      message: `${results.length} evaluation scores saved successfully`,
    };
  }

  // Placeholder for defence scheduling - not implemented yet
  // When implemented, add mail call after successful scheduling:
  // const student = await this.usersService.findById(proposal.createdBy);
  // if (student) {
  //   this.mailService.sendEmail(EmailType.DEFENSE_SCHEDULED, student.email, {
  //     recipientName: student.fullName,
  //     defenseDate: dto.defenseDate,
  //     defenseTime: dto.defenseTime,
  //     proposalTitle: proposal.title,
  //     location: dto.location,
  //   });
  // }
}
