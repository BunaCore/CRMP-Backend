# API Contract (Proposal Workflow)

## Purpose

Define stable request/response/error behavior for proposal workflow endpoints.

## Endpoints

### POST `/proposals/:id/submit`

Description:

- Submits first time or re-submits after revision/rejection.

Success response example:

```json
{
  "success": true,
  "message": "Proposal submitted successfully",
  "status": "Under_Review"
}
```

Common errors:

- `404` proposal not found
- `400` invalid status transition
- `403` unauthorized actor

### POST `/proposals/:id/approve`

Description:

- Accepts active step and advances workflow.

Body:

```json
{
  "note": "optional"
}
```

Success response example:

```json
{
  "success": true,
  "message": "Proposal approved successfully",
  "status": "Under_Review"
}
```

Common errors:

- `404` proposal or active step not found
- `400` no active step
- `403` not allowed approver

### POST `/proposals/:id/reject`

Description:

- Rejects active step and transitions proposal to `Draft`.

Body:

```json
{
  "note": "required"
}
```

Success response example:

```json
{
  "success": true,
  "message": "Proposal rejected successfully",
  "status": "Draft"
}
```

Common errors:

- `400` missing note or invalid action state
- `403` not allowed approver
- `404` proposal/step not found

### POST `/proposals/:id/request-revision`

Description:

- Requests revision and transitions proposal to `Needs_Revision`.

Body:

```json
{
  "note": "required"
}
```

Success response example:

```json
{
  "success": true,
  "message": "Revision requested successfully",
  "status": "Needs_Revision"
}
```

Common errors:

- `400` missing note or invalid action state
- `403` not allowed approver
- `404` proposal/step not found

## Query Endpoints

### GET `/proposals/my`

Returns proposals where user is creator or proposal member.

### GET `/proposals/pending-approvals`

Returns only actionable approvals based on:

- active step (`is_active = true`)
- pending decision (`decision = 'Pending'`)
- approver eligibility via centralized resolver

## Compatibility Rules

- Do not expose internal step iteration logic in API contract.
- Keep response shape stable even when workflow internals evolve.

## Change History

- 2026-03-30: Initial v1.
