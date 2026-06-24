# Risks & Open Questions — MC Labor Access Analysis

## Cross-week open assignment constraint

**Risk:** `job_assignments_one_open_per_employee` unique index may block creating a new assignment when an employee still has an **ACTIVE** assignment from a prior week, even if that assignment does not overlap the selected import week.

**Status:** Deferred to pilot. Week-scoped conflict UI ships first; pilot will determine whether to auto-end stale assignments or relax the schema constraint.

## Jobs sheet missing CustomerID

**Risk:** Raymond weekly workbook (`2026-06-19 Sample Imports.xlsx`) Jobs sheet has **ProjectID** but no **CustomerID**. Wrong inference could link a job to the wrong customer if Assignments ever map one ProjectID to multiple CustomerIDs.

**Mitigation implemented:** CustomerID inferred from Assignments sheet; validation errors if inference fails or customer unknown. Sample file: 98 jobs, 0 without assignment link, 0 multi-customer ProjectIDs.

**Open:** Confirm with Raymond whether CustomerID should be added to Jobs export long-term.

## Employee pay/bill rate updates

**Question:** Should pay rate and bill rate update on every employee paste, or only on initial import / assignment?

**Status:** Unchanged — rates update when present in import row. Sample workbook includes PayRate/BillRate on every employee row.

## Move date defaults

**Question:** When moving an employee, should the old assignment end the day before the new start, or the same day?

**Status:** Admin picks both dates explicitly. No auto-default beyond week bounds suggestion in UI.

## Working week edge cases

**Question:** What is "current week" on Friday/Saturday when planning next week?

**Status:** Default remains **Current Week**; UI suggests **Next Week** on Fri/Sat. Sample workbook uses week ending **06/19/2026** — select Custom Friday in UI.

## Week lock

**Question:** Should imports be blocked after Friday payroll closeout?

**Status:** Future scope — not implemented.

## Production import

**Risk:** Full workbook import (170+ employees, 180 assignments) on production without staging validation.

**Status:** Admin UI labels **staging only**. Pilot on staging with `docs/2026-06-19 Sample Imports.xlsx` before production approval.

## Reference assets in repo

| Asset | Status |
|-------|--------|
| `docs/2026-06-19 Sample Imports.xlsx` | In repo — weekly import reference |
| `access_frontend_initial_analysis.txt` | Not in repo |
| Legacy `2026 06-19 System -Up Date 01.xlsx` | Not in repo (superseded by Sample Imports workbook) |

## AR + Report Menu

See `09_MODERN_FRONTEND_SCOPE.md` — Phase 2, requires Raymond business rules sign-off.
