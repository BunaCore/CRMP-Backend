# ADR 0001: Active Step as Workflow Source of Truth

- Status: Accepted
- Date: 2026-03-30

## Context

Proposal workflow includes multi-step approvals and role-based approvers. Historical decisions and step ordering alone were not sufficient to identify the current actionable step safely.

## Decision

Use `proposal_approvals.isActive = true` and `decision = 'Pending'` as the only source of truth for the current actionable step.

## Consequences

Positive:

- `/pending-approvals` becomes simple and deterministic.
- Services avoid brittle history-based inference.
- Future support for parallel approvals can be introduced explicitly.

Trade-offs:

- Data integrity must enforce one active step maximum per proposal.
- Workflow transitions must carefully flip active flags transactionally.

## Alternatives Considered

1. Infer current step from max accepted `stepOrder`.
   - Rejected due to ambiguity and error-prone edge cases.
2. Infer from latest `decisionAt` record.
   - Rejected due to non-deterministic ordering during retries.

## Follow-Up

- Add regular invariant checks in ops/testing pipelines.
- Consider DB-level safeguard if workflow evolves to strict single-active enforcement.
