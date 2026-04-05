import {
  UserPreview,
  ProposalResponse,
  DepartmentPreview,
} from 'src/types/proposal-response.type';
import { ProposalMemberRole } from '../dto/proposal-member.dto';

/**
 * Map user DB entity to UserPreview
 * Optionally from proposal members with user details
 */
export function mapUserToPreview(user: {
  id: string;
  fullName?: string | null;
  name?: string;
  email?: string;
}): UserPreview {
  return {
    id: user.id,
    name: user.fullName || user.name || user.email || 'Unknown',
    // avatarUrl could be computed from gravatar or other service
    // avatarUrl: `https://api.gravatar.com/avatar/${encodeURIComponent(user.email || '')}`,
  };
}

/**
 * Map department DB entity to DepartmentPreview
 */
export function mapDepartmentToPreview(
  department: {
    id: string;
    name: string;
    code?: string;
  } | null,
): DepartmentPreview | null {
  if (!department) return null;

  return {
    id: department.id,
    name: department.name,
    code: department.code || '',
  };
}

/**
 * Map proposal + members + users to ProposalResponse
 * Extracts team members by role and computes aggregate stats
 */
export function mapProposalToResponse(
  proposal: {
    id: string;
    title: string;
    abstract?: string;
    currentStatus?: string;
    submittedAt?: Date;
    isFunded: boolean;
    degreeLevel?: string;
    researchArea?: string;
  },
  members: Array<{
    userId: string;
    role: string;
    user?: {
      id: string;
      fullName?: string;
      email?: string;
    };
  }>,
  usersMap: Map<
    string,
    {
      id: string;
      fullName?: string | null;
      email?: string;
    }
  >,
  departmentMap?: Map<
    string,
    {
      id: string;
      name: string;
      code?: string;
    }
  >,
  departmentId?: string,
  budget?: number,
): ProposalResponse {
  // Extract members by role
  const piMembers = members.filter((m) => m.role === ProposalMemberRole.PI);
  const advisorMembers = members.filter(
    (m) => m.role === ProposalMemberRole.ADVISOR,
  );
  const evaluatorMembers = members.filter(
    (m) => m.role === ProposalMemberRole.EVALUATOR,
  );

  // Map to UserPreview
  const piUser =
    piMembers.length > 0
      ? mapUserToPreview(
          usersMap.get(piMembers[0].userId) || { id: piMembers[0].userId },
        )
      : null;

  const advisorUsers = advisorMembers.map((m) =>
    mapUserToPreview(usersMap.get(m.userId) || { id: m.userId }),
  );

  const evaluatorUsers = evaluatorMembers.map((m) =>
    mapUserToPreview(usersMap.get(m.userId) || { id: m.userId }),
  );

  // Get department
  const department =
    departmentId && departmentMap
      ? mapDepartmentToPreview(departmentMap.get(departmentId) || null)
      : null;

  return {
    id: proposal.id,
    title: proposal.title,
    abstract: proposal.abstract,
    pi: piUser,
    advisors: advisorUsers,
    evaluators: evaluatorUsers,
    teamCount: members.length,
    department,
    submittedDate: proposal.submittedAt?.toISOString(),
    status: proposal.currentStatus || 'Draft',
    budget,
    isFunded: proposal.isFunded,
    degreeLevel: proposal.degreeLevel,
    researchArea: proposal.researchArea,
  };
}
