# Risks & Open Questions — MC Labor Access Analysis

## Cross-week open assignment constraint

**Risk:** `job_assignments_one_open_per_employee` unique index may block creating a new assignment when an employee still has an **ACTIVE** assignment from a prior week, even if that assignment does not overlap the selected import week.

**Status:** Deferred to pilot. Week-scoped conflict UI ships first; pilot will determine whether to auto-end stale assignments or relax the schema constraint.

## Employee pay/bill rate updates

**Question:** Should pay rate and bill rate update on every employee paste, or only on initial import / assignment?

**Status:** Unchanged — rates update when present in import row. Document only; no policy change in this phase.

## Move date defaults

**Question:** When moving an employee, should the old assignment end the day before the new start, or the same day?

**Status:** Admin picks both dates explicitly. No auto-default beyond week bounds suggestion in UI.

## Working week edge cases

**Question:** What is "current week" on Friday/Saturday when planning next week?

**Status:** Default remains **Current Week**; UI suggests **Next Week** on Fri/Sat. Admin selects explicitly.

## Week lock

**Question:** Should imports be blocked after Friday payroll closeout?

**Status:** Future scope — not implemented.

## Missing repo assets

The following were referenced in analysis but are **not in the repository**:

- `access_frontend_initial_analysis.txt`
- `2026 06-19 System -Up Date 01.xlsx`
- Raymond CSV samples (were local Downloads only)

Documented here for traceability; do not block implementation.

## AR + Report Menu

See `09_MODERN_FRONTEND_SCOPE.md` — Phase 2, requires Raymond business rules sign-off.
