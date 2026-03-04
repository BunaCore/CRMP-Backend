export enum Permission {
  // Project creation and submission
  PROJECT_CREATE = 'PROJECT_CREATE',
  PROJECT_PRE_REGISTER = 'PROJECT_PRE_REGISTER',
  PROJECT_SUBMIT = 'PROJECT_SUBMIT',

  // Project review and approval
  PROJECT_REVIEW = 'PROJECT_REVIEW',
  PROJECT_APPROVE = 'PROJECT_APPROVE',
  PROJECT_REJECT = 'PROJECT_REJECT',
  PROJECT_RECOMMEND = 'PROJECT_RECOMMEND',

  // Budget management
  BUDGET_VIEW = 'BUDGET_VIEW',
  BUDGET_APPROVE = 'BUDGET_APPROVE',
  BUDGET_REJECT = 'BUDGET_REJECT',

  // Team management
  TEAM_MANAGE = 'TEAM_MANAGE',
  TEAM_VIEW = 'TEAM_VIEW',
  EVALUATOR_ASSIGN = 'EVALUATOR_ASSIGN',

  // Ethical clearance
  ETHICS_REVIEW = 'ETHICS_REVIEW',
  ETHICS_APPROVE = 'ETHICS_APPROVE',
  ETHICS_REJECT = 'ETHICS_REJECT',

  // Administrative
  ADMIN_VIEW = 'ADMIN_VIEW',
  ADMIN_EDIT = 'ADMIN_EDIT',
  CALENDAR_MANAGE = 'CALENDAR_MANAGE',

  // View permissions
  PROJECT_VIEW = 'PROJECT_VIEW',
  USER_VIEW = 'USER_VIEW',

  // ── Coordinator-exclusive permissions (UG track) ──────────────
  // Only the COORDINATOR role receives these — no other role can access
  // undergrad routes even if they share common permissions like PROJECT_VIEW
  COORDINATOR_PROPOSALS_VIEW = 'COORDINATOR_PROPOSALS_VIEW', // list + detail + advisors
  COORDINATOR_DECIDE = 'COORDINATOR_DECIDE',                 // accept / reject / revision
  COORDINATOR_ASSIGN = 'COORDINATOR_ASSIGN',                 // assign advisor to proposal
}
