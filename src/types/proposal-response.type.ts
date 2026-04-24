/**
 * Frontend-friendly response types for proposal listing
 */

export type UserPreview = {
  id: string;
  name: string;
  avatarUrl?: string;
};

export type DepartmentPreview = {
  id: string;
  name: string;
  code: string;
};

export type ProposalResponse = {
  id: string;
  title: string;
  abstract?: string;
  program?: string | undefined;

  // Team
  pi: UserPreview | null;
  advisors: UserPreview[];
  evaluators: UserPreview[];
  teamCount: number;

  // Meta
  department: DepartmentPreview | null;
  submittedDate?: string;
  status: string;
  budget?: number;
  isFunded: boolean;
  degreeLevel?: string;
  researchArea?: string;
};
