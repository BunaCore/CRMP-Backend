import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq, and, SQL, asc, inArray } from 'drizzle-orm';

@Injectable()
export class ProjectsRepository {
  constructor(private readonly drizzle: DrizzleService) {}

  async findProjectsByUserId(userId: string) {
    return this.drizzle.db
      .select({
        projectId: schema.projects.projectId,
        projectTitle: schema.projects.projectTitle,
        isFunded: schema.projects.isFunded,
        projectStage: schema.projects.projectStage,
        projectDescription: schema.projects.projectDescription,
        submissionDate: schema.projects.submissionDate,
        researchArea: schema.projects.researchArea,
        projectProgram: schema.projects.projectProgram,
        departmentId: schema.projects.departmentId,
        durationMonths: schema.projects.durationMonths,
        ethicalClearanceStatus: schema.projects.ethicalClearanceStatus,
        bannerUrl: schema.projects.bannerUrl,
        publicFileUrl: schema.projects.publicFileUrl,
        publishedAt: schema.projects.publishedAt,
        isPublic: schema.projects.isPublic,
        createdAt: schema.projects.createdAt,
      })
      .from(schema.projectMembers)
      .innerJoin(
        schema.projects,
        eq(schema.projectMembers.projectId, schema.projects.projectId),
      )
      .where(eq(schema.projectMembers.userId, userId))
      .orderBy(schema.projects.createdAt);
  }

  async findProjectById(projectId: string) {
    const [project] = await this.drizzle.db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.projectId, projectId));
    return project;
  }

  async isUserMemberOfProject(
    userId: string,
    projectId: string,
  ): Promise<boolean> {
    const [member] = await this.drizzle.db
      .select()
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, userId),
        ),
      );
    return !!member;
  }

  async getProjectMembers(projectId: string) {
    return this.drizzle.db
      .select({
        userId: schema.users.id,
        fullName: schema.users.fullName,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
        role: schema.projectMembers.role,
        addedAt: schema.projectMembers.addedAt,
      })
      .from(schema.projectMembers)
      .innerJoin(
        schema.users,
        eq(schema.projectMembers.userId, schema.users.id),
      )
      .where(eq(schema.projectMembers.projectId, projectId))
      .orderBy(schema.projectMembers.addedAt);
  }

  async getProjectMembersWithDetails(projectId: string) {
    return this.drizzle.db
      .select({
        userId: schema.users.id,
        fullName: schema.users.fullName,
        email: schema.users.email,
        avatarUrl: schema.users.avatarUrl,
        role: schema.projectMembers.role,
        addedAt: schema.projectMembers.addedAt,
      })
      .from(schema.projectMembers)
      .innerJoin(
        schema.users,
        eq(schema.projectMembers.userId, schema.users.id),
      )
      .where(eq(schema.projectMembers.projectId, projectId))
      .orderBy(schema.projectMembers.addedAt);
  }

  async getProjectBudgetByProjectId(projectId: string) {
    const budgetRequest = await this.drizzle.db.query.budgetRequests.findFirst({
      where: eq(schema.budgetRequests.projectId, projectId),
    });

    if (!budgetRequest) {
      return null;
    }

    const items = await this.drizzle.db
      .select({
        id: schema.budgetRequestItems.id,
        lineIndex: schema.budgetRequestItems.lineIndex,
        description: schema.budgetRequestItems.description,
        requestedAmount: schema.budgetRequestItems.requestedAmount,
      })
      .from(schema.budgetRequestItems)
      .where(eq(schema.budgetRequestItems.budgetRequestId, budgetRequest.id))
      .orderBy(schema.budgetRequestItems.lineIndex);

    return {
      id: budgetRequest.id,
      proposalId: budgetRequest.proposalId,
      projectId: budgetRequest.projectId,
      currentStatus: budgetRequest.currentStatus,
      totalAmount: budgetRequest.totalAmount,
      approvedAmount: budgetRequest.approvedAmount,
      createdAt: budgetRequest.createdAt,
      items,
    };
  }

  async isUserPIOfProject(userId: string, projectId: string): Promise<boolean> {
    const [pi] = await this.drizzle.db
      .select()
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, projectId),
          eq(schema.projectMembers.userId, userId),
          eq(schema.projectMembers.role, 'PI'),
        ),
      );
    console.log('PI check:', { userId, projectId, pi });
    return !!pi;
  }

  async findPublicProjects() {
    return this.drizzle.db
      .select({
        projectId: schema.projects.projectId,
        projectTitle: schema.projects.projectTitle,
        projectDescription: schema.projects.projectDescription,
        researchArea: schema.projects.researchArea,
        bannerUrl: schema.projects.bannerUrl,
        publicFileUrl: schema.projects.publicFileUrl,
        projectProgram: schema.projects.projectProgram,
        department: schema.departments.name,
        departmentId: schema.projects.departmentId,
        publishedAt: schema.projects.publishedAt,
        durationMonths: schema.projects.durationMonths,
      })
      .from(schema.projects)
      .leftJoin(
        schema.departments,
        eq(schema.projects.departmentId, schema.departments.id),
      )
      .where(eq(schema.projects.isPublic, true))
      .orderBy(schema.projects.publishedAt);
  }

  async findPublicProjectById(projectId: string) {
    const [project] = await this.drizzle.db
      .select({
        projectId: schema.projects.projectId,
        projectTitle: schema.projects.projectTitle,
        projectDescription: schema.projects.projectDescription,
        researchArea: schema.projects.researchArea,
        bannerUrl: schema.projects.bannerUrl,
        publicFileUrl: schema.projects.publicFileUrl,
        projectProgram: schema.projects.projectProgram,
        department: schema.departments.name,
        departmentId: schema.projects.departmentId,
        publishedAt: schema.projects.publishedAt,
        durationMonths: schema.projects.durationMonths,
      })
      .from(schema.projects)
      .leftJoin(
        schema.departments,
        eq(schema.projects.departmentId, schema.departments.id),
      )
      .where(
        and(
          eq(schema.projects.projectId, projectId),
          eq(schema.projects.isPublic, true),
        ),
      );
    return project;
  }

  async updateProjectPublish(
    projectId: string,
    publishedBy: string,
    data: { isPublic: boolean; publicFileUrl: string; bannerUrl?: string },
  ) {
    const [updated] = await this.drizzle.db
      .update(schema.projects)
      .set({
        isPublic: data.isPublic,
        publicFileUrl: data.publicFileUrl,
        bannerUrl: data.bannerUrl,
        publishedAt: new Date(),
        publishedBy,
      })
      .where(eq(schema.projects.projectId, projectId))
      .returning();
    return updated;
  }

  async getProjects(
    where: SQL<unknown> | undefined,
    pagination: { page: number; limit: number },
  ) {
    const offset = (pagination.page - 1) * pagination.limit;

    const projectsWithPI = await this.drizzle.db
      .select({
        projectId: schema.projects.projectId,
        projectTitle: schema.projects.projectTitle,
        isFunded: schema.projects.isFunded,
        projectStage: schema.projects.projectStage,
        projectDescription: schema.projects.projectDescription,
        submissionDate: schema.projects.submissionDate,
        researchArea: schema.projects.researchArea,
        projectProgram: schema.projects.projectProgram,
        departmentId: schema.projects.departmentId,
        durationMonths: schema.projects.durationMonths,
        ethicalClearanceStatus: schema.projects.ethicalClearanceStatus,
        bannerUrl: schema.projects.bannerUrl,
        publicFileUrl: schema.projects.publicFileUrl,
        publishedAt: schema.projects.publishedAt,
        isPublic: schema.projects.isPublic,
        createdAt: schema.projects.createdAt,
        piId: schema.users.id,
        piName: schema.users.fullName,
        piEmail: schema.users.email,
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
      .where(where)
      .orderBy(schema.projects.createdAt)
      .limit(pagination.limit)
      .offset(offset);

    // Count total for pagination metadata
    const countResult = await this.drizzle.db
      .select({ count: schema.projects.projectId })
      .from(schema.projects)
      .where(where);

    const total = countResult.length;

    // Group results to handle the LEFT JOIN producing duplicate rows per PI
    const groupedProjects = projectsWithPI.reduce((acc, row) => {
      const existing = acc.find((p) => p.projectId === row.projectId);
      if (!existing) {
        acc.push({
          projectId: row.projectId,
          projectTitle: row.projectTitle,
          isFunded: row.isFunded,
          projectStage: row.projectStage,
          projectDescription: row.projectDescription,
          submissionDate: row.submissionDate,
          researchArea: row.researchArea,
          projectProgram: row.projectProgram,
          departmentId: row.departmentId,
          durationMonths: row.durationMonths,
          ethicalClearanceStatus: row.ethicalClearanceStatus,
          bannerUrl: row.bannerUrl,
          publicFileUrl: row.publicFileUrl,
          publishedAt: row.publishedAt,
          isPublic: row.isPublic,
          createdAt: row.createdAt,
          pi: row.piId
            ? {
                id: row.piId,
                fullName: row.piName,
                email: row.piEmail,
              }
            : null,
        });
      }
      return acc;
    }, [] as Array<any>);

    return {
      data: groupedProjects,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        pages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async updateProjectVisibility(
    projectId: string,
    isPublic: boolean,
  ): Promise<void> {
    await this.drizzle.db
      .update(schema.projects)
      .set({
        isPublic,
        publishedAt: isPublic ? new Date() : null,
      })
      .where(eq(schema.projects.projectId, projectId));
  }

  async updateProjectAssets(
    projectId: string,
    assets: {
      bannerFileId?: string;
      bannerUrl?: string;
      publicFileId?: string;
      publicFileUrl?: string;
    },
  ): Promise<void> {
    const updateData: any = {};
    if (assets.bannerFileId !== undefined) {
      updateData.bannerFileId = assets.bannerFileId;
    }
    if (assets.bannerUrl !== undefined) {
      updateData.bannerUrl = assets.bannerUrl;
    }
    if (assets.publicFileId !== undefined) {
      updateData.publicFileId = assets.publicFileId;
    }
    if (assets.publicFileUrl !== undefined) {
      updateData.publicFileUrl = assets.publicFileUrl;
    }

    if (Object.keys(updateData).length === 0) {
      return; // Nothing to update
    }

    await this.drizzle.db
      .update(schema.projects)
      .set(updateData)
      .where(eq(schema.projects.projectId, projectId));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Project Defence Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Insert a new defence schedule row for a project (project phase).
   * Multiple rows per project are allowed (rescheduling).
   */
  async createProjectDefence(data: {
    projectId: string;
    scheduledBy: string;
    defenceDate: Date;
    location: string;
    note?: string;
  }) {
    const [defence] = await this.drizzle.db
      .insert(schema.projectDefences)
      .values({
        projectId: data.projectId,
        scheduledBy: data.scheduledBy,
        defenceDate: data.defenceDate,
        location: data.location,
        note: data.note ?? null,
      })
      .returning();

    return defence;
  }

  /**
   * Get all defence schedules for a project, ordered by defenceDate ASC.
   * Multiple schedules allowed (rescheduling).
   */
  async getProjectDefencesByProjectId(projectId: string) {
    return this.drizzle.db
      .select({
        id: schema.projectDefences.id,
        projectId: schema.projectDefences.projectId,
        scheduledBy: schema.projectDefences.scheduledBy,
        defenceDate: schema.projectDefences.defenceDate,
        location: schema.projectDefences.location,
        note: schema.projectDefences.note,
        createdAt: schema.projectDefences.createdAt,
      })
      .from(schema.projectDefences)
      .where(eq(schema.projectDefences.projectId, projectId))
      .orderBy(asc(schema.projectDefences.defenceDate));
  }

  /**
   * Bulk-fetch defence schedules for many projects at once.
   * Returns a map: projectId → DefenceRow[]
   */
  async getProjectDefencesByProjectIds(
    projectIds: string[],
  ): Promise<Map<string, any[]>> {
    if (projectIds.length === 0) return new Map();

    const rows = await this.drizzle.db
      .select({
        id: schema.projectDefences.id,
        projectId: schema.projectDefences.projectId,
        scheduledBy: schema.projectDefences.scheduledBy,
        defenceDate: schema.projectDefences.defenceDate,
        location: schema.projectDefences.location,
        note: schema.projectDefences.note,
        createdAt: schema.projectDefences.createdAt,
      })
      .from(schema.projectDefences)
      .where(inArray(schema.projectDefences.projectId, projectIds))
      .orderBy(asc(schema.projectDefences.defenceDate));

    // Group by projectId for O(1) access in the service
    const map = new Map<string, any[]>();
    for (const row of rows) {
      if (!map.has(row.projectId)) map.set(row.projectId, []);
      map.get(row.projectId)!.push(row);
    }
    return map;
  }
}
