# Data Model Guide (Workflow-Relevant)

## Purpose

Capture the essential tables and invariants behind proposal workflow behavior.

## Primary Tables

## `proposals`

Important fields:

- `id`
- `createdBy`
- `currentStatus`
- `currentStepOrder`
- `isEditable`
- `workspaceUnlocked`
- `projectId`

## `proposal_approvals`

Important fields:

- `proposalId`
- `routingRuleId`
- `stepOrder`
- `approverRole`
- `decision`
- `isActive`
- `approverUserId`
- `decisionAt`
- `comment`

## `routing_rules`

Defines step topology and approver role sequence by program/status context.

## `proposal_members`

Maps proposal collaborators and roles.

## `projects`

Created after final proposal approval.

## `project_members`

Derived from `proposal_members` during project creation.

## `proposal_status_history`

Append-only status change timeline.

## `audit_logs`

Operational/event logs including project creation side effects.

## Relationships

- `proposals` 1:N `proposal_approvals`
- `proposals` 1:N `proposal_members`
- `proposals` 1:N `proposal_status_history`
- `proposals` 1:1 `projects` (created post-approval)
- `projects` 1:N `project_members`

## Invariants to Preserve

1. One active step max per proposal.
2. Active step must be pending.
3. Only approver-eligible users can act on active step.
4. Proposal status transitions must be persisted to status history.
5. Final approval creates project and migrates members.

## Migration Notes

When changing workflow schema:

- Keep backward compatibility for in-flight proposals.
- Add data migration for active step integrity.
- Validate with post-migration checks for duplicate active steps.

## Change History

- 2026-03-30: Initial v1.
