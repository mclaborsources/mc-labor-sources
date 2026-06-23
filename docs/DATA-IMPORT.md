# Data Import — Master System Paste Workflow

## Implementation map

| Layer | Location |
|-------|----------|
| Parsing | `apps/admin-web/src/components/import/paste-utils.ts`, `import-parsers.ts` |
| UI workflow | `ImportWorkflow.tsx`, `ImportPreviewTable.tsx`, `WorkingWeekSelector.tsx`, `app/data-import/page.tsx` |
| API | `apps/admin-web/src/lib/supabase/data.ts` RPC wrappers |
| Working week | `apps/admin-web/src/lib/working-week.ts` |
| DB | `import_*_batch` functions + `data_import_runs` in `supabase/migrations/20250624000001_master_import.sql`, compat patches in `20250626000001_import_export_compat.sql`, working-week migration in `20250627000001_import_working_week.sql` |
| Tables | `employees`, `customers`, `job_sites`, `job_assignments`, `data_import_runs` |

---

## Raymond-confirmed rules

### Employee Status (optional)

- **Status column is optional** in employee paste. New employees default to **Active**.
- On **update**, status changes only when the import row **explicitly includes** a non-empty Status value.
- Manual **Inactive** on the Employees page is preserved when re-importing without Status.
- Re-import with explicit Status **Active** or **Inactive** applies that value.

### Working week (assignments)

MC Labor working week = **Saturday 00:00 through Friday 23:59** (week **ending Friday**).

- **Current Week** — Sat–Fri week containing today; on Sat/Sun, the week whose Friday is the upcoming Friday.
- **Next Week** — the following Sat–Fri week.
- **Custom** — pick any week-ending Friday.

Assignment conflicts are detected **only for the selected working week**, not globally.

### Assignment conflicts

If an employee has an overlapping assignment on a **different job** during the selected week:

- **Skip** — do not import this row; existing assignment unchanged.
- **Move** — requires **both** an end date for the current assignment and a start date for the new one. Commit is blocked until both dates are set.

Conflict preview shows current job → new job and the selected week dates.

### Import order

1. Employees
2. Customers
3. Jobs (requires Customer ID)
4. Assignments (requires Employee, Customer, Job IDs; select working week first)

### Paste format

Copy from **Excel or CSV with column headers** (tab- or comma-separated). Do not use space-separated paste.

See [DATA-IMPORT-SAMPLES.md](./DATA-IMPORT-SAMPLES.md) for staging sample rows.

---

## Admin access

**Data Import** is available only to `ADMIN` and `SUPER_ADMIN` roles via `/data-import`.

## Import history

View past imports at `/data-import/history`.

| Field | Description |
|-------|-------------|
| Type | EMPLOYEE, CUSTOMER, JOB, ASSIGNMENT |
| Week | Sat–Fri range for ASSIGNMENT runs only |
| Conflicts | Count of conflict rows in ASSIGNMENT runs |
| Counts | Pasted, created, updated, skipped, failed |

---

## Open questions

| Topic | Status |
|-------|--------|
| Preserve manual Inactive on weekly re-import | **Implemented** — omit Status on update |
| Pay/bill rate update every employee import vs assignment-only | **Unchanged** — rates update when present in paste |
| Move default end date | **Admin picks dates** — no auto default |
| Working week default on Friday | **Current Week** default; UI suggests Next Week on Fri/Sat |
| Week lock after Friday closeout | Future scope |
| AR + Report Menu daily reports | Phase 2 — see `docs/mc-labor-access-analysis/09_MODERN_FRONTEND_SCOPE.md` |
| Cross-week stale open assignment vs unique index | **Deferred to pilot** — may hit `job_assignments_one_open_per_employee` |

---

## Production import checklist

1. Back up Supabase (point-in-time recovery or export)
2. Run `supabase db push` for migration `20250627000001_import_working_week.sql`
3. Import sample employees → review (with and without Status column)
4. Import sample customers → review
5. Import sample jobs → review
6. Import sample assignments with working week selector → verify conflict workflow
7. Proceed with larger imports in order above

Manual test steps: [DATA-IMPORT-TEST-CHECKLIST.md](./DATA-IMPORT-TEST-CHECKLIST.md)
