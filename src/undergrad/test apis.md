# ============================================================
# UNDERGRAD COORDINATOR APIs — Postman Test Guide
# Base URL: http://localhost:3000
# ============================================================
# HOW TO USE:
#   1. Login as COORDINATOR → copy the JWT token
#   2. Every request needs: Authorization: Bearer <token>
#   3. Content-Type: application/json  (for PATCH)
# ============================================================


# ─────────────────────────────────────────────────────────────
# STEP 0: Get a Coordinator JWT Token
# ─────────────────────────────────────────────────────────────
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "email": "coordinator@university.edu",
  "password": "yourpassword"
}
# → Copy the "access_token" from the response


# ─────────────────────────────────────────────────────────────
# API 1: List ALL UG Proposals (no filter)
# ─────────────────────────────────────────────────────────────
GET http://localhost:3000/undergrad/proposals
Authorization: Bearer <YOUR_COORDINATOR_JWT>

# Expected response: { count: N, proposals: [...] }
# Each proposal includes: researcher info, coordinator approval row, budget total


# ─────────────────────────────────────────────────────────────
# API 2: List UG Proposals — filter by STATUS
# ─────────────────────────────────────────────────────────────
GET http://localhost:3000/undergrad/proposals?status=Submitted
Authorization: Bearer <YOUR_COORDINATOR_JWT>

# Other valid status values:
GET http://localhost:3000/undergrad/proposals?status=Approved
GET http://localhost:3000/undergrad/proposals?status=Rejected
GET http://localhost:3000/undergrad/proposals?status=Needs_Revision


# ─────────────────────────────────────────────────────────────
# API 3: List UG Proposals — search by title or researcher name
# ─────────────────────────────────────────────────────────────
GET http://localhost:3000/undergrad/proposals?search=climate
Authorization: Bearer <YOUR_COORDINATOR_JWT>

# Combine both:
GET http://localhost:3000/undergrad/proposals?status=Submitted&search=John
Authorization: Bearer <YOUR_COORDINATOR_JWT>


# ─────────────────────────────────────────────────────────────
# API 4: Get ONE Proposal — Full Level-3 Detail
# ─────────────────────────────────────────────────────────────
GET http://localhost:3000/undergrad/proposals/<PROPOSAL_UUID>
Authorization: Bearer <YOUR_COORDINATOR_JWT>

# Replace <PROPOSAL_UUID> with real UUID from API 1 response
# Response includes:
#   - core proposal + researcher
#   - versions (all PDF files)
#   - budget (header + line items)
#   - statusHistory (full audit trail with notes)
#   - approvalSteps (all routing steps + decisions + comments)
#   - assignedAdvisors


# ─────────────────────────────────────────────────────────────
# API 5a: ACCEPT a proposal (with comment)
# ─────────────────────────────────────────────────────────────
PATCH http://localhost:3000/undergrad/proposals/<PROPOSAL_UUID>/decision
Authorization: Bearer <YOUR_COORDINATOR_JWT>
Content-Type: application/json

{
  "decision": "Accepted",
  "comment": "Proposal meets all requirements. Research area is well-defined. Approved for workspace activation."
}

# What happens in DB:
#   proposal_approvals.decision  → "Accepted"
#   proposal_approvals.comment   → your comment (researcher can read this)
#   proposal_approvals.approver_user_id → coordinator's user id
#   proposal_approvals.decision_at → timestamp
#   proposals.current_status     → "Approved"
#   proposals.workspace_unlocked → true   ← workspace opens immediately
#   proposal_status_history      → new row (note = your comment)
#   notifications                → researcher is notified with comment embedded
#   audit_logs                   → DECISION_MADE event recorded


# ─────────────────────────────────────────────────────────────
# API 5b: ACCEPT without a comment (comment is optional)
# ─────────────────────────────────────────────────────────────
PATCH http://localhost:3000/undergrad/proposals/<PROPOSAL_UUID>/decision
Authorization: Bearer <YOUR_COORDINATOR_JWT>
Content-Type: application/json

{
  "decision": "Accepted"
}


# ─────────────────────────────────────────────────────────────
# API 5c: REJECT a proposal
# ─────────────────────────────────────────────────────────────
PATCH http://localhost:3000/undergrad/proposals/<PROPOSAL_UUID>/decision
Authorization: Bearer <YOUR_COORDINATOR_JWT>
Content-Type: application/json

{
  "decision": "Rejected",
  "comment": "Proposal lacks a clear methodology section and research objectives are too broad."
}

# proposals.current_status → "Rejected"
# workspace stays locked


# ─────────────────────────────────────────────────────────────
# API 5d: REQUEST REVISION
# ─────────────────────────────────────────────────────────────
PATCH http://localhost:3000/undergrad/proposals/<PROPOSAL_UUID>/decision
Authorization: Bearer <YOUR_COORDINATOR_JWT>
Content-Type: application/json

{
  "decision": "Needs_Revision",
  "comment": "Please revise Chapter 2 to include a literature review. Also clarify the data collection timeline."
}

# proposals.current_status → "Needs_Revision"
# notification type        → "Revision_Required" (different bell icon on UI)
# workspace stays locked


# ─────────────────────────────────────────────────────────────
# API 6: List Available ADVISORS & EVALUATORS
# ─────────────────────────────────────────────────────────────
# This returns all active users with the ADVISOR (Supervisor) or EVALUATOR role.
# The coordinator picks one to assign to the proposal.
GET http://localhost:3000/undergrad/advisors
Authorization: Bearer <YOUR_COORDINATOR_JWT>


# ─────────────────────────────────────────────────────────────
# API 7: ASSIGN ADVISOR to Proposal
# ─────────────────────────────────────────────────────────────
# After picking an ID from API 6, use it here.
POST http://localhost:3000/undergrad/proposals/<PROPOSAL_UUID>/assign-evaluator
Authorization: Bearer <YOUR_COORDINATOR_JWT>
Content-Type: application/json

{
  "advisorUserId": "<ADVISOR_USER_UUID>",
  "dueDate": "2026-06-30"
}

# What happens:
# 1. Row added to evaluator_assignments
# 2. proposals.advisor_user_id is stamped (permanent link)
# 3. Notification sent to the Advisor
# 4. Audit log created


# ─────────────────────────────────────────────────────────────
# ERROR CASES TO TEST
# ─────────────────────────────────────────────────────────────

# Test: Wrong role (e.g. login as STUDENT, try to call these APIs)
# Expected: 403 Forbidden — "Insufficient permissions to access this resource"

# Test: Invalid UUID in :id param
GET http://localhost:3000/undergrad/proposals/not-a-uuid
# Expected: 400 Bad Request — "Validation failed"

# Test: Wrong decision value
PATCH http://localhost:3000/undergrad/proposals/<PROPOSAL_UUID>/decision
Content-Type: application/json
{ "decision": "Maybe" }
# Expected: 400 — "decision must be one of: Accepted, Rejected, Needs_Revision"

# Test: Decide on already-decided proposal
# (Call PATCH twice on the same proposal)
# Expected: 409 Conflict — "This proposal has already been reviewed by a coordinator"

# Test: Proposal ID doesn't exist
PATCH http://localhost:3000/undergrad/proposals/00000000-0000-0000-0000-000000000000/decision
# Expected: 404 Not Found