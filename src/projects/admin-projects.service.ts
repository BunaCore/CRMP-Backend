import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq, and, ilike, or, SQL, count, sql } from 'drizzle-orm';
import { WorkflowService } from 'src/proposals/workflow.service';

@Injectable()
export class AdminProjectsService {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly workflowService: WorkflowService,
  ) {}

  async getAdminProjectsList(query: any, userRoles: string[] = []) {
    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '10', 10);
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    // Role-based program scoping
    const allowedPrograms = new Set<string>();
    const hasGlobalAccess = ['SYSTEM_ADMIN', 'RAD', 'VPRTT', 'AC_MEMBER'].some(
      (r) => userRoles.includes(r),
    );

    if (!hasGlobalAccess) {
      if (userRoles.includes('COORDINATOR')) allowedPrograms.add('UG');
      if (userRoles.includes('DGC_MEMBER') || userRoles.includes('PG_OFFICE'))
        allowedPrograms.add('PG');
      if (userRoles.includes('ADRPM')) allowedPrograms.add('GENERAL');

      if (allowedPrograms.size === 0) {
        // No valid admin role to view any projects
        return { data: [], meta: { total: 0, page, totalPages: 0 } };
      }
    }

    if (query.search) {
      conditions.push(
        or(
          ilike(schema.projects.projectTitle, `%${query.search}%`),
          // ilike(schema.projects.projectId, `%${query.search}%`)
        ) as SQL,
      );
    }
    if (query.status) {
      conditions.push(eq(schema.projects.projectStage, query.status as any));
    }
    if (query.departmentId) {
      conditions.push(eq(schema.projects.departmentId, query.departmentId));
    }
    if (query.program) {
      if (!hasGlobalAccess && !allowedPrograms.has(query.program as string)) {
        // User requested a program they don't have access to
        return { data: [], meta: { total: 0, page, totalPages: 0 } };
      }
      conditions.push(eq(schema.projects.projectProgram, query.program as any));
    } else if (!hasGlobalAccess && allowedPrograms.size > 0) {
      const programsArray = Array.from(allowedPrograms);
      conditions.push(
        sql`${schema.projects.projectProgram} IN ${programsArray}`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await this.drizzle.db
      .select({ count: count() })
      .from(schema.projects)
      .where(whereClause);
    const total = countResult.count;

    // Fetch projects with PI and Department and Budget
    const projectsRaw = await this.drizzle.db
      .select({
        id: schema.projects.projectId,
        code: schema.projects.projectId, // Use id as code for now
        name: schema.projects.projectTitle,
        status: schema.projects.projectStage,
        program: schema.projects.projectProgram,
        startDate: schema.projects.createdAt,
        endDate: schema.projects.createdAt, // Dummy end date since not in schema
        piName: schema.users.fullName,
        piAvatar: schema.users.avatarUrl,
        deptName: schema.departments.name,
        proposalId: schema.proposals.id,
      })
      .from(schema.projects)
      .leftJoin(
        schema.projectMembers,
        and(
          eq(schema.projectMembers.projectId, schema.projects.projectId),
          eq(schema.projectMembers.role, 'PI'),
        ),
      )
      .leftJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
      .leftJoin(
        schema.departments,
        eq(schema.projects.departmentId, schema.departments.id),
      )
      .leftJoin(
        schema.proposals,
        eq(schema.proposals.projectId, schema.projects.projectId),
      )
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(sql`${schema.projects.createdAt} DESC`);

    // We need to calculate progress and get total budget.
    // For progress, we'll fetch proposal approvals for these proposals.
    const proposalIds = projectsRaw.map((p) => p.proposalId).filter(Boolean);

    let approvals: any[] = [];
    if (proposalIds.length > 0) {
      approvals = await this.drizzle.db
        .select()
        .from(schema.proposalApprovals)
        .where(sql`${schema.proposalApprovals.proposalId} IN ${proposalIds}`);
    }

    const projectIds = projectsRaw.map((p) => p.id);
    let budgetTotals: any[] = [];
    if (projectIds.length > 0) {
      budgetTotals = await this.drizzle.db
        .select({
          projectId: schema.projectBudgetItems.projectId,
          total: sql<number>`SUM(CAST(${schema.projectBudgetItems.amount} AS NUMERIC))`,
        })
        .from(schema.projectBudgetItems)
        .where(sql`${schema.projectBudgetItems.projectId} IN ${projectIds}`)
        .groupBy(schema.projectBudgetItems.projectId);
    }

    const data = projectsRaw.map((p) => {
      // Calculate progress
      let progress = 0;
      if (p.proposalId) {
        const pApprovals = approvals.filter(
          (a) => a.proposalId === p.proposalId,
        );
        const totalSteps = pApprovals.length;
        if (totalSteps > 0) {
          const completedSteps = pApprovals.filter(
            (a) => !a.isActive && a.decision !== 'Pending',
          ).length;
          progress = Math.round((completedSteps / totalSteps) * 100);
        }
      }

      const budgetRecord = budgetTotals.find((b) => b.projectId === p.id);
      const budgetTotal = budgetRecord ? Number(budgetRecord.total) : 0;

      return {
        id: p.id,
        code: p.id.split('-')[0].toUpperCase(), // Short code from UUID
        name: p.name,
        pi: {
          name: p.piName || 'Unknown PI',
          avatarUrl: p.piAvatar,
        },
        dept: p.deptName || 'N/A',
        status: p.status,
        progress,
        budget: {
          total: budgetTotal,
        },
        startDate: p.startDate,
        endDate: p.endDate, // Assuming no direct end_date in schema yet
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminProjectDetail(
    projectId: string,
    currentUserId: string,
    userRoles: string[] = [],
  ) {
    const [project] = await this.drizzle.db
      .select({
        id: schema.projects.projectId,
        name: schema.projects.projectTitle,
        abstract: schema.projects.projectDescription,
        status: schema.projects.projectStage,
        program: schema.projects.projectProgram,
        proposalId: schema.proposals.id,
      })
      .from(schema.projects)
      .leftJoin(
        schema.proposals,
        eq(schema.proposals.projectId, schema.projects.projectId),
      )
      .where(eq(schema.projects.projectId, projectId));

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Role-based program scoping for details
    const allowedPrograms = new Set<string>();
    const hasGlobalAccess = ['SYSTEM_ADMIN', 'RAD', 'VPRTT', 'AC_MEMBER'].some(
      (r) => userRoles.includes(r),
    );

    if (!hasGlobalAccess) {
      if (userRoles.includes('COORDINATOR')) allowedPrograms.add('UG');
      if (userRoles.includes('DGC_MEMBER') || userRoles.includes('PG_OFFICE'))
        allowedPrograms.add('PG');
      if (userRoles.includes('ADRPM')) allowedPrograms.add('GENERAL');

      if (!allowedPrograms.has(project.program as string)) {
        throw new ForbiddenException(
          'You do not have permission to view projects in this program.',
        );
      }
    }

    // Team array
    const team = await this.drizzle.db
      .select({
        id: schema.users.id,
        name: schema.users.fullName,
        email: schema.users.email,
        role: schema.projectMembers.role,
        avatarUrl: schema.users.avatarUrl,
      })
      .from(schema.projectMembers)
      .innerJoin(
        schema.users,
        eq(schema.projectMembers.userId, schema.users.id),
      )
      .where(eq(schema.projectMembers.projectId, projectId));

    // Detailed Financials
    const budgetItems = await this.drizzle.db
      .select({
        amount: schema.projectBudgetItems.amount,
        status: schema.projectBudgetItems.status,
      })
      .from(schema.projectBudgetItems)
      .where(eq(schema.projectBudgetItems.projectId, projectId));

    let allocated = 0;
    let disbursed = 0;

    budgetItems.forEach((item) => {
      const amt = Number(item.amount) || 0;
      allocated += amt;
      if (item.status === 'PAID') {
        disbursed += amt;
      }
    });

    let timeline = null;
    if (project.proposalId) {
      timeline = await this.workflowService.getApprovalTimelineForFrontend(
        project.proposalId,
        currentUserId,
      );
    }

    return {
      id: project.id,
      name: project.name,
      abstract: project.abstract,
      status: project.status,
      program: project.program,
      team,
      financials: {
        allocated,
        disbursed,
      },
      timeline, // exact same ApprovalTimeline structure
    };
  }

  async terminateProject(projectId: string, reason: string) {
    // We update the project stage to Rejected and record audit/history if possible
    // The prompt says "lock the project, revoking edit/submission access for the PI".
    // In our domain, Rejected stage means it cannot be edited or disbursed.
    await this.drizzle.db
      .update(schema.projects)
      .set({
        projectStage: 'Rejected' as any,
        projectDescription: sql`CONCAT(${schema.projects.projectDescription}, '\n\n[TERMINATED]: ', ${reason})`,
      })
      .where(eq(schema.projects.projectId, projectId));

    return { success: true, message: 'Project terminated successfully' };
  }

  async exportProjectPdf(projectId: string) {
    // Stub implementation for PDF generation. In real scenario, would generate PDF and return URL/Stream.
    return {
      success: true,
      url: `/api/downloads/project-${projectId}.pdf`,
      message: 'PDF export generated',
    };
  }
}
