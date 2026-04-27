/**
 * Internal types for proposal querying and filtering
 */

export interface ProposalRow {
  id: string;
  title: string;
  abstract: string | null;
  proposalProgram: string | null;
  currentStatus: string | null;
  submittedAt: Date | null;
  isFunded: boolean | null;
  degreeLevel: string | null;
  researchArea: string | null;
  departmentId: string | null;
  createdBy: string;
}

export interface BudgetRow {
  proposalId: string | null;
  totalAmount: string | null;
}

export interface MemberRow {
  id: string;
  proposalId: string;
  userId: string;
  role: 'PI' | 'MEMBER' | 'SUPERVISOR' | 'ADVISOR' | 'EVALUATOR';
  addedAt: Date;
}

export interface UserRow {
  id: string;
  fullName: string | null;
  email: string | null;
  department: string | null;
  isExternal: boolean | null;
}

export interface DepartmentRow {
  id: string;
  name: string;
  code: string | null;
}

export interface ProposalWithMembersAndBudget {
  proposal: ProposalRow;
  budget: BudgetRow | null;
  members: Array<MemberRow & { user: UserRow }>;
  department: DepartmentRow | null;
}
