export enum Role {
  // --- Academic / Research Identity ---
  STUDENT = 'STUDENT',
  FACULTY = 'FACULTY', // Base role for all academic staff
  SUPERVISOR = 'SUPERVISOR', // Explicit authority to lead/advise research
  EVALUATOR = 'EVALUATOR', // Explicit authority to peer-review/grade

  // --- Departmental Authority (Scoped by Dept) ---
  COORDINATOR = 'COORDINATOR', // Dept Head / UG Management
  DGC_MEMBER = 'DGC_MEMBER', // Dept Graduate Committee member

  // --- College & Central Offices (Scoped by College or Global) ---
  COLLEGE_OFFICE = 'COLLEGE_OFFICE', // ADRPM / College Rep
  PG_OFFICE = 'PG_OFFICE', // School of Graduate Studies (SGS)
  RAD = 'RAD', // Research Administration Directorate
  FINANCE = 'FINANCE', // Budget & Disbursement

  // --- Executive & System ---
  VPRTT = 'VPRTT', // VP Research, Technology & Transfer
  AC_MEMBER = 'AC_MEMBER', // Academic Council member
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',

  // --- Guest/Outside Access ---
  EXTERNAL_EXPERT = 'EXTERNAL_EXPERT', // For invited external advisors/evaluators
}
