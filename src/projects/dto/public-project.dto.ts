export type ProjectMemberDetailDto = {
  userId: string;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  addedAt: Date | null;
};

export type ProjectBudgetItemDto = {
  id: string;
  lineIndex: number | null;
  description: string;
  requestedAmount: string;
};

export type ProjectBudgetDto = {
  id: string;
  proposalId: string | null;
  projectId: string | null;
  currentStatus: string | null;
  totalAmount: string | null;
  approvedAmount: string | null;
  createdAt: Date | null;
  items: ProjectBudgetItemDto[];
};

export class PublicProjectDto {
  projectId: string;
  projectTitle: string;
  projectDescription?: string;
  researchArea?: string;
  bannerUrl?: string;
  publicFileUrl: string;
  projectProgram?: 'UG' | 'PG' | 'GENERAL';
  department?: string;
  departmentId?: string;
  publishedAt: Date;
  durationMonths: number;
  members?: ProjectMemberDetailDto[];
  budget?: ProjectBudgetDto | null;
}
