# CRMP Backend Documentation

This folder contains maintainable, decision-focused documentation for the proposal workflow and related APIs.

## Start Here

1. `workflow-overview.md` — state model, invariants, and transitions.
2. `proposal-execution.md` — submission and review execution behavior.
3. `api-contract.md` — endpoint contracts and error behavior.
4. `data-model.md` — table relationships and workflow invariants.
5. `runbook.md` — debugging and operational recovery steps.
6. `testing-strategy.md` — expected test coverage and scenarios.
7. `adr/` — architecture decisions and rationale.

## Documentation Standards

Each doc should include:

- Purpose and scope
- Invariants (must always be true)
- Edge cases/failure behavior
- Verification checklist
- Change history section

## Ownership

- Primary owners: Backend maintainers for `proposals`, `workflow`, `pg`, `undergrad`, and `funded` modules.
- Update expectation: Whenever workflow/status logic, schema invariants, or endpoint behavior changes.

## Related Existing Docs

- `PROPOSAL_WORKFLOW.md` (legacy overview)
- `AUTH_ACCESS_INTEGRATION.md`
- `JWT_SECURITY.md`
