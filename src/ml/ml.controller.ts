import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { DrizzleService } from 'src/db/db.service';
import { JwtAuthGuard } from 'src/auth/jwt.guard';
import * as schema from 'src/db/schema';
import { eq } from 'drizzle-orm';
import { MlService } from './ml.service';

@Controller('ml')
export class MlController {
  constructor(
    private readonly drizzle: DrizzleService,
    private readonly mlService: MlService,
  ) {}

  @Get('training-data')
  async getTrainingData() {
    const allUsers = await this.drizzle.db.query.users.findMany({
      columns: {
        id: true,
        fullName: true,
        department: true,
      },
    });

    const allProposals = await this.drizzle.db.query.proposals.findMany({
      columns: {
        id: true,
        title: true,
        abstract: true,
        researchArea: true,
        departmentId: true,
      },
    });

    const allDepartments = await this.drizzle.db.query.departments.findMany();
    const deptsMap = new Map(allDepartments.map(d => [d.id, d.name]));

    const allMembers = await this.drizzle.db.query.proposalMembers.findMany();

    // Group members by proposal
    const proposalData = allProposals.map(p => ({
      id: p.id,
      title: p.title,
      abstract: p.abstract,
      researchArea: p.researchArea,
      department: p.departmentId ? deptsMap.get(p.departmentId) : null,
      user_ids: allMembers.filter(m => m.proposalId === p.id).map(m => m.userId)
    }));

    // For collaborations, we can use members who worked on the same proposal
    const collaborations: Array<{user_id: string, collaborator_id: string, score: number}> = [];
    const proposalMembersMap = new Map<string, string[]>();
    
    allMembers.forEach(m => {
      if (!proposalMembersMap.has(m.proposalId)) {
        proposalMembersMap.set(m.proposalId, []);
      }
      proposalMembersMap.get(m.proposalId)?.push(m.userId);
    });

    proposalMembersMap.forEach((uids) => {
      for (let i = 0; i < uids.length; i++) {
        for (let j = i + 1; j < uids.length; j++) {
          collaborations.push({
            user_id: uids[i],
            collaborator_id: uids[j],
            score: 1.0
          });
        }
      }
    });

    return {
      users: allUsers,
      proposals: proposalData,
      collaborations: collaborations
    };
  }

  @Post('recommend-members')
  async recommendMembers(@Body() body: any) {
    console.log('Backend received ML recommend-members request:', body);
    return this.mlService.recommendMembers(body);
  }
}
