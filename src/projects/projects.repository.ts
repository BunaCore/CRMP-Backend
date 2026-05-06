import { Injectable } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq, and } from 'drizzle-orm';

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
}
