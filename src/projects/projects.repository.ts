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
      .innerJoin(schema.projects, eq(schema.projectMembers.projectId, schema.projects.projectId))
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

  async isUserMemberOfProject(userId: string, projectId: string): Promise<boolean> {
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
}