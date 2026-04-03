export interface ProposalMemberWithUser {
  id: string;
  proposalId: string;
  userId: string;
  role: 'PI' | 'MEMBER' | 'SUPERVISOR' | 'ADVISOR' | 'EVALUATOR';
  addedAt: Date;
  user: {
    id: string;
    fullName: string | null;
    department: string | null;
    isExternal: boolean | null;
  };
}

export interface ProposalMemberValidation {
  hasPi: boolean;
  creatorIncluded: boolean;
}
