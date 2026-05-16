import { Injectable, BadRequestException } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import { evaluationScores, evaluationRubrics } from 'src/db/schema/evaluation';
import { proposals, proposalMembers } from 'src/db/schema/proposals';
import { projects, projectMembers } from 'src/db/schema/project';
import { users } from 'src/db/schema/user';
import { SubmitScoresDto } from './dto/submit-scores.dto';
import { eq, and, notInArray, inArray, SQL, or } from 'drizzle-orm';
import { Role } from 'src/access-control/role.enum';
import { AuthenticatedUser } from 'src/auth/decorators/current-user.decorator';

@Injectable()
export class EvaluationsService {
  constructor(private readonly db: DrizzleService) {}

  async getProposals(user: AuthenticatedUser) {
    const conditions: SQL[] = [];
    conditions.push(
      notInArray(proposals.currentStatus, ['Approved', 'Rejected']),
    );

    if (user.roles?.includes(Role.COORDINATOR)) {
      conditions.push(eq(proposals.proposalProgram, 'UG'));
    } else if (user.roles?.includes(Role.DGC_MEMBER)) {
      conditions.push(eq(proposals.proposalProgram, 'PG'));
    } else if (user.roles?.includes(Role.RAD)) {
      conditions.push(eq(proposals.proposalProgram, 'GENERAL'));
    } else if (user.roles?.includes(Role.EVALUATOR)) {
      const memberProposals = await this.db.db
        .select({ proposalId: proposalMembers.proposalId })
        .from(proposalMembers)
        .where(
          and(
            eq(proposalMembers.userId, user.id),
            eq(proposalMembers.role, 'EVALUATOR'),
          ),
        );
      const ids = memberProposals.map((m) => m.proposalId);
      if (ids.length === 0) return this.emptyPaginatedResponse();
      conditions.push(inArray(proposals.id, ids));
    } else {
      return this.emptyPaginatedResponse();
    }

    const fetchedProposals = await this.db.db
      .select({
        id: proposals.id,
        title: proposals.title,
        program: proposals.proposalProgram,
        createdAt: proposals.createdAt,
      })
      .from(proposals)
      .where(and(...conditions));

    return this.enrichWithMembersAndRubrics(
      fetchedProposals,
      user.id,
      'PROPOSAL',
    );
  }

  async getProjects(user: AuthenticatedUser) {
    const conditions: SQL[] = [];
    conditions.push(
      notInArray(projects.projectStage, ['Completed', 'Rejected']),
    );

    if (user.roles?.includes(Role.COORDINATOR)) {
      conditions.push(eq(projects.projectProgram, 'UG'));
    } else if (user.roles?.includes(Role.DGC_MEMBER)) {
      conditions.push(eq(projects.projectProgram, 'PG'));
    } else if (user.roles?.includes(Role.RAD)) {
      conditions.push(eq(projects.projectProgram, 'GENERAL'));
    } else if (user.roles?.includes(Role.EVALUATOR)) {
      const memberProjects = await this.db.db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.userId, user.id),
            eq(projectMembers.role, 'EVALUATOR'),
          ),
        );
      const ids = memberProjects.map((m) => m.projectId);
      if (ids.length === 0) return this.emptyPaginatedResponse();
      conditions.push(inArray(projects.projectId, ids));
    } else {
      return this.emptyPaginatedResponse();
    }

    const fetchedProjects = await this.db.db
      .select({
        id: projects.projectId,
        title: projects.projectTitle,
        program: projects.projectProgram,
        proposalId: proposals.id,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .innerJoin(proposals, eq(proposals.projectId, projects.projectId))
      .where(and(...conditions));

    return this.enrichWithMembersAndRubrics(
      fetchedProjects,
      user.id,
      'PROJECT',
    );
  }

  private emptyPaginatedResponse() {
    return {
      items: [],
      meta: {
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }

  private async enrichWithMembersAndRubrics(
    items: any[],
    evaluatorId: string,
    phase: 'PROPOSAL' | 'PROJECT',
  ) {
    if (items.length === 0) return this.emptyPaginatedResponse();

    const ids = items.map((i) => i.id);

    let membersData: {
      parentId: string;
      studentId: string;
      name: string | null;
    }[] = [];
    if (phase === 'PROPOSAL') {
      membersData = await this.db.db
        .select({
          parentId: proposalMembers.proposalId,
          studentId: proposalMembers.userId,
          name: users.fullName,
        })
        .from(proposalMembers)
        .innerJoin(users, eq(users.id, proposalMembers.userId))
        .where(
          and(
            inArray(proposalMembers.proposalId, ids),
            inArray(proposalMembers.role, ['PI', 'MEMBER']),
          ),
        );
    } else {
      membersData = await this.db.db
        .select({
          parentId: projectMembers.projectId,
          studentId: projectMembers.userId,
          name: users.fullName,
        })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(
          and(
            inArray(projectMembers.projectId, ids),
            inArray(projectMembers.role, ['PI', 'MEMBER']),
          ),
        );
    }

    let phaseRubrics;
    if (phase === 'PROPOSAL') {
      phaseRubrics = await this.db.db
        .select()
        .from(evaluationRubrics)
        .where(eq(evaluationRubrics.phase, 'PROPOSAL'));
    } else {
      phaseRubrics = await this.db.db.select().from(evaluationRubrics);
    }

    const existingScoresQuery = this.db.db
      .select()
      .from(evaluationScores)
      .where(
        and(
          eq(evaluationScores.evaluatorId, evaluatorId),
          phase === 'PROPOSAL'
            ? inArray(evaluationScores.proposalId, ids)
            : or(
                inArray(evaluationScores.projectId, ids),
                inArray(
                  evaluationScores.proposalId,
                  items.map((i) => i.proposalId),
                ),
              ),
        ),
      );
    const existingScores = await existingScoresQuery;

    const enrichedItems = items.map((item) => {
      const itemMembers = membersData
        .filter((m) => m.parentId === item.id)
        .map((m) => ({ studentId: m.studentId, name: m.name }));

      const itemScores = existingScores.filter((s) =>
        phase === 'PROPOSAL'
          ? s.proposalId === item.id
          : s.projectId === item.id || s.proposalId === item.proposalId,
      );

      const missingRubrics = phaseRubrics
        .filter((rubric) => {
          if (itemMembers.length === 0) return false;

          const scoredStudentIds = itemScores
            .filter((s) => s.rubricId === rubric.id)
            .map((s) => s.studentId);

          return !itemMembers.every((m) =>
            scoredStudentIds.includes(m.studentId),
          );
        })
        .map((r) => ({
          id: r.id,
          name: r.name,
          maxPoints: r.maxPoints,
          isIndividual: r.isIndividual,
        }));

      return {
        id: item.id,
        title: item.title,
        program: item.program,
        createdAt: item.createdAt,
        members: itemMembers,
        missingRubrics,
      };
    });

    return {
      items: enrichedItems,
      meta: {
        page: 1,
        limit: 10,
        totalItems: enrichedItems.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }

  async submitScores(
    targetId: string,
    dto: SubmitScoresDto,
    user: AuthenticatedUser,
  ) {
    if (dto.scores.length === 0) {
      return { success: true };
    }

    // Resolve proposalId and projectId from targetId
    const [proposal] = await this.db.db
      .select({ id: proposals.id, projectId: proposals.projectId })
      .from(proposals)
      .where(or(eq(proposals.id, targetId), eq(proposals.projectId, targetId)))
      .limit(1);

    if (!proposal) {
      throw new BadRequestException(
        'Proposal or Project not found for this evaluation',
      );
    }

    const actualProposalId = proposal.id;
    const actualProjectId = proposal.projectId;

    await this.db.db.transaction(async (tx) => {
      // Group scores by rubricId
      const scoresByRubric = new Map<string, typeof dto.scores>();
      for (const score of dto.scores) {
        if (!scoresByRubric.has(score.rubricId)) {
          scoresByRubric.set(score.rubricId, []);
        }
        scoresByRubric.get(score.rubricId)!.push(score);
      }

      for (const [rubricId, rubricScores] of scoresByRubric.entries()) {
        const [rubric] = await tx
          .select()
          .from(evaluationRubrics)
          .where(eq(evaluationRubrics.id, rubricId));

        if (!rubric) {
          throw new BadRequestException(`Rubric ${rubricId} not found`);
        }

        // Validation removed: The frontend calculates group vs individual distributions natively
        // and sends explicit duplicate scores for each student.

        for (const scoreEntry of rubricScores) {
          await tx
            .insert(evaluationScores)
            .values({
              rubricId: rubricId,
              proposalId: actualProposalId,
              projectId: actualProjectId || null,
              studentId: scoreEntry.studentId,
              evaluatorId: user.id,
              score: scoreEntry.score.toString(),
              feedback: scoreEntry.feedback || null,
            })
            .onConflictDoUpdate({
              target: [
                evaluationScores.rubricId,
                evaluationScores.proposalId,
                evaluationScores.studentId,
              ],
              set: {
                score: scoreEntry.score.toString(),
                feedback: scoreEntry.feedback || null,
                updatedAt: new Date(),
              },
            });
        }
      }
    });

    return { success: true };
  }
}
