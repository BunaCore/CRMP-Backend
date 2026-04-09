# Proposal Approval API Examples

The `WorkflowService` handles all proposal approval actions: accept, reject, and request revision.

## Endpoints

All endpoints require authentication (JWT token with `PROPOSAL_APPROVE` permission).

### 1. APPROVE (Accept Step)

**Endpoint:** `POST /proposals/:proposalId/approve`

**Request:**

```json
{
  "note": "Looks good, approved for DGC committee."
}
```

**Response (not final step):**

```json
{
  "success": true,
  "message": "Proposal approved. Moving to next step.",
  "proposalId": "uuid-123",
  "newStatus": "Under_Review",
  "nextStep": 2,
  "isComplete": false
}
```

**Response (final step):**

```json
{
  "success": true,
  "message": "Proposal fully approved. Project created.",
  "proposalId": "uuid-123",
  "newStatus": "Approved",
  "isComplete": true
}
```

---

### 2. REJECT (Reject Step)

**Endpoint:** `POST /proposals/:proposalId/reject`

**Request:**

```json
{
  "note": "Methodology section is incomplete. Resubmit with detailed approach."
}
```

**Response:**

```json
{
  "success": true,
  "message": "Proposal rejected. Creator can now resubmit.",
  "proposalId": "uuid-123",
  "newStatus": "Draft"
}
```

---

### 3. REQUEST REVISION (Needs Revision)

**Endpoint:** `POST /proposals/:proposalId/request-revision`

**Request:**

```json
{
  "note": "Please add more detail on data collection methodology and address the research limitations."
}
```

**Response:**

```json
{
  "success": true,
  "message": "Revision requested. Proposal unlocked for editing.",
  "proposalId": "uuid-123",
  "newStatus": "Needs_Revision"
}
```

---

## Status Flow

```
Under_Review (workflow active)
  ├─ APPROVE → Next step (or Approved if final)
  ├─ REJECT → Draft (creator can resubmit)
  └─ REVISION → Needs_Revision (workspace unlocked, creator edits)
```

## Notes

- **`note` field:** Optional comment explaining the decision
- **Authorization:** User must have matching role for the current step
- **COORDINATOR:** Must belong to proposal's department
- **Parallel steps:** Only the current approver's decision is recorded
- **Audit trail:** All decisions logged in `proposal_status_history`

Searched for text `submitFormResponse submitVote`, no results

Searched for text `FORM VOTE stepType submission`, no results

Searched for text `submittedJson voteJson` (`**/src/proposals/**/*.ts`), no results

You're right! We talked about handling **FORM** and **VOTE** steps differently. Let me check if we have endpoints for those:

Read [](file:///home/dag/Documents/vscode/myProjs/CRMP/CRMP-Backend/src/proposals/proposals.controller.ts#200-200), lines 200 to 300

Perfect! Found it! There's a **unified action endpoint** for FORM and VOTE steps. Let me get the full details:

Read [](file:///home/dag/Documents/vscode/myProjs/CRMP/CRMP-Backend/src/proposals/proposals.controller.ts#275-275), lines 275 to 340

Found it! The **`POST /proposals/:id/action`** endpoint handles both FORM and VOTE submissions. Let me check the DTO and add examples to our docs:

Searched for text `SubmitStepActionDto` (`**/src/proposals/dto/**/*.ts`), 1 result

Read [](file:///home/dag/Documents/vscode/myProjs/CRMP/CRMP-Backend/src/proposals/dto/workflow.dto.ts)

Perfect! Now I'll add the FORM and VOTE examples to the docs:

Read [](file:///home/dag/Documents/vscode/myProjs/CRMP/CRMP-Backend/docs/approval-examples.md#1-1), lines 1 to 60

Multi-Replace String in Files

Ah yes! You're right — we created the **`POST /proposals/:id/action`** endpoint that handles both FORM and VOTE submissions. Here are the examples:

## **4. SUBMIT FORM** (for FORM step type)

```json
POST /proposals/:proposalId/action

{
  "action": "SUBMIT",
  "comment": "Please see attached evaluation report",
  "submittedData": {
    "evaluationReport": "file-uuid-abc123",
    "comments": "Strong research methodology and clear objectives."
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Action \"SUBMIT\" completed successfully",
  "proposalId": "uuid-123",
  "newStatus": "Under_Review",
  "nextStep": 3,
  "isComplete": false
}
```

---

## **5. SUBMIT VOTE** (for VOTE step type)

**Approve:**

```json
POST /proposals/:proposalId/action

{
  "action": "VOTE",
  "decision": "Accepted",
  "comment": "Strong research design with clear objectives"
}
```

**Reject:**

```json
{
  "action": "VOTE",
  "decision": "Rejected",
  "comment": "Insufficient methodology detail"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Action \"VOTE\" completed successfully",
  "proposalId": "uuid-123",
  "newStatus": "Under_Review",
  "isComplete": false
}
```

---

**Key differences:**

- **FORM:** `action="SUBMIT"` + `submittedData` (field values + fileIds)
- **VOTE:** `action="VOTE"` + `decision` (Accepted/Rejected/Needs_Revision)

Both use the same endpoint but route based on step type and action!
