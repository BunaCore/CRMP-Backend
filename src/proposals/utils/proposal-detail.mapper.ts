/**
 * Response types for detailed proposal view
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

export type WorkflowStep = {
  stepOrder: number;
  label: string;
  role: string;
  status: string;
  isActive: boolean;
  comment?: string;          // Feedback left by the approver
  approverUserId?: string;   // Who gave this decision
};

export type CommentPreview = {
  id: string;
  commentText: string;
  authorId: string;
  isResolved: boolean;
  createdAt: string;
};

export type DefenceSchedule = {
  id: string;
  defenceDate: string;
  location: string;
  note?: string | null;
  scheduledBy?: string | null;
  createdAt: string;
};

export type ProposalDetailResponse = {
  id: string;
  title: string;
  type: 'UG' | 'PG' | 'GRANT';
  status: string;

  department: DepartmentPreview | null;

  pi: UserPreview | null;
  advisors: UserPreview[];
  evaluators: UserPreview[];
  team: UserPreview[];

  workflow: {
    currentStepOrder: number | null;
    steps: WorkflowStep[];
  };

  comments: CommentPreview[];
  defenceSchedules: DefenceSchedule[];

  createdAt: string;
};

/**
 * Map user to UserPreview
 */
export function mapUserToPreview(user: any): UserPreview {
  return {
    id: user.id,
    name: user.fullName || user.email || 'Unknown',
    avatarUrl: undefined, // Can be extended with gravatar logic later
  };
}

/**
 * Map department to DepartmentPreview
 */
export function mapDepartmentToPreview(
  department: any,
): DepartmentPreview | null {
  if (!department) {
    return null;
  }

  return {
    id: department.id,
    name: department.name,
    code: department.code,
  };
}

/**
 * Extract members by role from proposal members array
 */
export function extractMembersByRole(members: any[]) {
  const pi = members.find((m) => m.role === 'PI');
  const advisors = members.filter((m) => m.role === 'ADVISOR');
  const evaluators = members.filter((m) => m.role === 'EVALUATOR');
  const teamMembers = members.filter((m) => m.role === 'MEMBER');

  return { pi, advisors, evaluators, teamMembers };
}

/**
 * Map approval records to workflow steps
 */
export function mapApprovalsToWorkflowSteps(approvals: any[]): {
  steps: WorkflowStep[];
  currentStepOrder: number | null;
} {
  const steps: WorkflowStep[] = approvals.map((approval) => ({
    stepOrder: approval.stepOrder,
    label: `Step ${approval.stepOrder}`,
    role: approval.approverRole || 'Unknown',
    status: approval.decision || 'Pending',
    isActive: approval.isActive === true,
    comment: approval.comment ?? undefined,
    approverUserId: approval.approverUserId ?? undefined,
  }));

  const currentStep = approvals.find((a) => a.isActive === true);
  const currentStepOrder = currentStep ? currentStep.stepOrder : null;

  return { steps, currentStepOrder };
}

/**
 * Map proposal to detailed response
 */
export function mapProposalToDetailResponse(
  proposal: any,
  members: any[],
  usersMap: Map<string, any>,
  department: any,
  approvals: any[],
  comments: any[] = [],
  defenceSchedules: any[] = [],
): ProposalDetailResponse {
  // Extract members by role
  const { pi, advisors, evaluators, teamMembers } =
    extractMembersByRole(members);

  // Map workflow steps
  const { steps, currentStepOrder } = mapApprovalsToWorkflowSteps(approvals);

  // Determine proposal type from proposalProgram
  let type: 'UG' | 'PG' | 'GRANT' = 'GRANT';
  if (proposal.proposalProgram?.includes('UG')) {
    type = 'UG';
  } else if (proposal.proposalProgram?.includes('PG')) {
    type = 'PG';
  }

  return {
    id: proposal.id,
    title: proposal.title,
    type,
    status: proposal.currentStatus || 'Draft',

    department: mapDepartmentToPreview(department),

    pi: pi ? mapUserToPreview(usersMap.get(pi.userId)) : null,
    advisors: advisors
      .map((m) => usersMap.get(m.userId))
      .filter((u): u is any => !!u)
      .map(mapUserToPreview),
    evaluators: evaluators
      .map((m) => usersMap.get(m.userId))
      .filter((u): u is any => !!u)
      .map(mapUserToPreview),
    team: teamMembers
      .map((m) => usersMap.get(m.userId))
      .filter((u): u is any => !!u)
      .map(mapUserToPreview),

    workflow: {
      currentStepOrder,
      steps,
    },

    comments: comments.map((c) => ({
      id: c.id,
      commentText: c.commentText,
      authorId: c.authorId,
      isResolved: c.isResolved ?? false,
      createdAt: c.createdAt?.toISOString() || new Date().toISOString(),
    })),

    defenceSchedules: defenceSchedules.map((d) => ({
      id: d.id,
      defenceDate: d.defenceDate?.toISOString(),
      location: d.location,
      note: d.note ?? null,
      scheduledBy: d.scheduledBy ?? null,
      createdAt: d.createdAt?.toISOString() || new Date().toISOString(),
    })),

    createdAt: proposal.createdAt?.toISOString() || new Date().toISOString(),
  };
}
