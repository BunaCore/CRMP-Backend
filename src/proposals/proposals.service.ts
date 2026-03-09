import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { DrizzleService } from 'src/db/db.service';
import * as schema from 'src/db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class ProposalsService {
  constructor(private readonly drizzle: DrizzleService) {}

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
}
