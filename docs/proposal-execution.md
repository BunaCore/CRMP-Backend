# Proposal Execution Guide

## Purpose

Describe runtime behavior for proposal creation, submission, review actions, and re-submission.

## Execution Flows

### 1) Create Proposal

Expected behavior:

- Proposal is created in `Draft`.
- No active approval step is created during draft-only lifecycle.
- Proposal remains editable.

### 2) Submit Proposal

Preconditions:

- Proposal exists.
- Caller is proposal owner.
- Status is `Draft` or `Needs_Revision`.

Behavior:

- First submit: generate approval steps from `routing_rules` and activate first step.
- Re-submit: reactivate the last incomplete step (`Rejected`/`Needs_Revision`/`Pending`), keep prior approvals.
- Set proposal status to `Under_Review`.
- Set `isEditable = false`.
- Record status history.

### 3) Approve Current Step

Preconditions:

- One active pending step exists.
- Caller is valid approver for active step.

Behavior:

- Mark active step as `Accepted`.
- If a next pending step exists, activate it.
- If no next pending step exists, mark proposal `Approved`.
- On final approval, create project and migrate proposal members to project members.
- Record status history.

### 4) Reject Current Step

Preconditions:

- One active pending step exists.
- Caller is valid approver.
- Note is provided.

Behavior:

- Mark active step as `Rejected` and deactivate all active/pending steps.
- Move proposal to `Draft`.
- Set `isEditable = false`.
- Record status history.

### 5) Request Revision

Preconditions:

- One active pending step exists.
- Caller is valid approver.
- Note is provided.

Behavior:

- Mark active step as `Needs_Revision` and deactivate all active/pending steps.
- Move proposal to `Needs_Revision`.
- Set `isEditable = true`.
- Record status history.

## Operational Notes

- Controllers delegate business rules to `WorkflowService`.
- Services are transactional per action.
- `/pending-approvals` must only return actionable approvals tied to active pending steps.

## Change History

- 2026-03-30: Initial v1.
