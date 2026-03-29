# Testing Strategy (Workflow)

## Purpose

Define high-value tests for confidence in proposal workflow correctness.

## Priority Test Layers

1. Service-level workflow tests (primary)
2. Controller endpoint tests (contract + validation)
3. Integration tests for database side effects

## Must-Have Scenarios

### Submission

- Draft submit creates steps and activates first step.
- Needs_Revision submit resumes from last incomplete step.
- Invalid status submit is rejected.

### Approval Actions

- Approve active step advances to next pending step.
- Final approve sets `Approved`, unlocks workspace, creates project.
- Reject sets `Draft` with non-editable state.
- Request revision sets `Needs_Revision` with editable state.

### Authorization

- Non-eligible users cannot approve/reject/revise.
- Coordinator eligibility requires department match.

### Query Endpoints

- `/pending-approvals` includes only active pending actionable records.
- `/my` includes created + member-linked proposals.

## Invariant Tests

- At most one active step per proposal.
- Active step must be pending.
- Status transitions are persisted in history.

## Regression Checklist

Run after schema or workflow changes:

- Workflow submit/approve/reject/revision happy paths
- Resubmit edge path
- Final approval project creation path
- Pending approvals filtering correctness

## Change History

- 2026-03-30: Initial v1.
