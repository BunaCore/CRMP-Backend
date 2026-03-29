# Workflow Overview

## Purpose

Define the canonical proposal approval workflow and state transitions.

## Canonical Proposal Statuses

- `Draft`
- `Under_Review`
- `Needs_Revision`
- `Approved`

No separate `Submitted` status is used. Submitted proposals are represented by `Under_Review`.

## Workflow Source of Truth

Current review position is determined by `proposal_approvals.is_active = true`.

### Invariants

1. At most one active step per proposal.
2. Active step must have `decision = 'Pending'`.
3. A proposal in `Under_Review` must have one active step.
4. A proposal in `Draft`, `Needs_Revision`, or `Approved` must not have active steps.
5. `workspaceUnlocked = true` only when proposal status is `Approved`.
6. `isEditable = true` only when status is `Draft` or `Needs_Revision`.

## Transition Matrix

- `Draft` -> `Under_Review` on submit
- `Needs_Revision` -> `Under_Review` on re-submit
- `Under_Review` -> `Approved` on final step accepted
- `Under_Review` -> `Draft` on reject
- `Under_Review` -> `Needs_Revision` on revision request

## Approval Step Rules

- First submission: steps generated from `routing_rules`.
- Re-submission: resume from last incomplete step by resetting that step to `Pending` and activating it.
- Accept: current active step becomes accepted, next pending step is activated.
- Final accept: status moves to `Approved`, project creation flow runs.

## Role Resolution

- Required role must match `approverRole`.
- `COORDINATOR` additionally requires coordinator assignment for proposal/project department.
- All other approver roles use role-only checks.

## Audit & History

Every status transition must be written to `proposal_status_history`.
Project creation should also generate an `audit_logs` entry.

## Change History

- 2026-03-30: Initial v1 aligned with Phase 3/4/5 workflow model.
