export enum Role {
  // --- Academic / Research Identity ---
  STUDENT = 'STUDENT',
  FACULTY = 'FACULTY', // Base role for all academic staff
  ADVISOR = 'ADVISOR', // Explicit authority to lead/advise research
  EVALUATOR = 'EVALUATOR', // Explicit authority to peer-review/grade

  // --- Departmental Authority (Scoped by Dept) ---
  COORDINATOR = 'COORDINATOR', // Dept Head / UG Management
  DGC_MEMBER = 'DGC_MEMBER', // Dept Graduate Committee member

  // --- College & Central Offices (Scoped by College or Global) ---
  ADRPM = 'ADRPM', // ADRPM / College Rep
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
