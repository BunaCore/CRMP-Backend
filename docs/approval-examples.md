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
