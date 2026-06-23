# Modern Frontend Scope — MC Labor Access Analysis

## Current state

- **Admin web** (`apps/admin-web`) — Data Import, employees, customers, jobs, assignments, timesheets
- **Mobile app** (`apps/mobile`) — field worker / supervisor flows
- **Legacy** — Access/SQL Server master system (Raymond's source of truth)

## Phase 1 (implemented)

- Paste import workflow with Raymond CSV compatibility
- Working week selector for assignment imports
- Week-scoped conflict detection
- Import history with week and conflict counts

## Phase 2 — high-priority daily reports (not built)

Raymond identified these as **daily-use** reports from the legacy system:

| Report | Priority | Notes |
|--------|----------|-------|
| **Accounts Receivable Report** | High | Customer billing / outstanding balances |
| **Report Menu** (aggregate daily reports) | High | Entry point for operational reporting |

These require business rules confirmation (date ranges, GL mapping, customer filters) before implementation.

## Phase 2 — other candidates

- Local web frontend replacing Access UI for back-office staff
- Automated SQL Server → Supabase sync (vs paste import)
- Week lock after payroll closeout
- Export to Raymond-compatible formats

## Out of scope

- SQL Server / Access schema changes
- Production data migration scripts
- Mobile changes for import workflow
