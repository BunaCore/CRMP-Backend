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
}
