# Workflow Runbook

## Purpose

Operational guide for diagnosing and fixing proposal workflow issues.

## Quick Triage Checklist

1. Confirm proposal exists and current status.
2. Confirm active step exists for `Under_Review` proposals.
3. Confirm active step has `decision = 'Pending'`.
4. Confirm caller has required approver role.
5. For `COORDINATOR`, confirm department coordinator mapping.
6. Check status history entries for transition evidence.

## Common Incidents

### Incident: Proposal missing from `/pending-approvals`

Checks:

- Is there an active step?
- Is active step pending?
- Is user role eligible for active `approverRole`?
- If coordinator step, does user belong to that department?

### Incident: Multiple active steps

Checks:

- Query `proposal_approvals` by proposal and `isActive = true`.
- Determine conflicting rows and decide canonical step.
- Deactivate incorrect rows and log corrective action.

### Incident: Approver cannot approve

Checks:

- Validate active step role.
- Validate user role assignment.
- Validate coordinator-to-department association where applicable.

### Incident: Final approval did not create project

Checks:

- Verify final step transition reached `Approved`.
- Check transaction/audit logs for project creation failure.
- Verify proposal members exist before migration.

## Recovery Guidelines

- Prefer transactional repair scripts.
- Avoid direct manual row edits without post-checks.
- Record every manual fix in operations notes.

## Post-Incident Verification

- Re-run `/pending-approvals` and `/my` checks.
- Confirm proposal status history continuity.
- Confirm project linkage (`proposal.projectId`) on approved proposals.

## Change History

- 2026-03-30: Initial v1.
