# Data Import — Master System Paste Workflow

## Implementation map

| Layer | Location |
|-------|----------|
| Workbook upload | `WorkbookImportWorkflow.tsx`, `excel-workbook.ts` |
| Parsing | `paste-utils.ts`, `import-parsers.ts` |
| Cross-sheet validation | `import-validation.ts` |
| UI workflow | `ImportWorkflow.tsx`, `ImportPreviewTable.tsx`, `WorkingWeekSelector.tsx`, `app/data-import/page.tsx` |
| API | `apps/admin-web/src/lib/supabase/data.ts` RPC wrappers + `getImportReferenceIds()` |
| Working week | `apps/admin-web/src/lib/working-week.ts` |
| DB | `import_*_batch` + `data_import_runs` migrations (`20250624000001`, `20250626000001`, `20250627000001`) |
| Reference workbook | `docs/2026-06-19 Sample Imports.xlsx` (week ending **06/19/2026**) |

---

## Weekly workbook import (preferred)

Upload **one Excel file** (`.xlsx`) with four sheets:

| Sheet | Purpose |
|-------|---------|
| **Employees** | EmployeeID, names, phone, email, trade, pay/bill rates (no Status required) |
| **Customers** | CustomerID, address, salesman, up to 10 contact column groups |
| **Jobs** | ProjectID, site name/address, start date, foreman (no CustomerID in Raymond export) |
| **Assignments** | CustomerID + ProjectID + EmployeeID |

### Workbook flow

1. Upload/select workbook
2. Parse all four sheets
3. Infer **CustomerID** on Jobs from Assignments when Jobs sheet has no CustomerID column
4. Validate IDs across sheets and against existing portal records
5. Preview all four sections (create/update/conflict/error counts)
6. Resolve assignment conflicts (Skip / Move with both dates)
7. Import in order: **Employees → Customers → Jobs → Assignments**

Use **Weekly Workbook** mode on `/data-import`. Select the working week (sample file: week ending **06/19/2026** → Custom Friday `2026-06-19`). The admin UI presents this as a step-based flow: working week → upload → preview/confirm.

**Staging only** — do not run production imports from this screen.

### Single-sheet paste (legacy)

**Single-Sheet Paste** mode remains for ad-hoc imports of one entity type at a time (copy/paste from Excel/CSV with headers).

---

## Raymond-confirmed rules

### Employee Status (optional)

- **Status column is optional** (absent in `2026-06-19 Sample Imports.xlsx`).
- New employees default to **Active**.
- On update, status changes only when the row **explicitly includes** Status.
- Manual **Inactive** on the Employees page is preserved when re-importing without Status.

### Working week (assignments)

MC Labor week = **Saturday 00:00 through Friday 23:59** (week **ending Friday**).

Assignment conflicts are detected **only for the selected working week**.

### Assignment conflicts

- **Skip** — do not import row; existing assignment unchanged
- **Move** — requires **both** end date (current) and start date (new)

### Jobs without CustomerID

The Raymond Jobs sheet uses **ProjectID** only. CustomerID is **inferred from Assignments** (CustomerID + ProjectID pairs). If a job cannot be linked, add CustomerID to the Jobs sheet or fix Assignments — import is blocked with a clear error.

### Cross-sheet validation

Before import, every Assignment row is checked:

| Field | Must exist in |
|-------|----------------|
| EmployeeID | Employees sheet **or** portal |
| CustomerID | Customers sheet **or** portal |
| ProjectID | Jobs sheet **or** portal |

---

## Import history

`/data-import/history` — type, week (assignments), conflicts, counts, row details.

---

## Open questions

| Topic | Status |
|-------|--------|
| Preserve manual Inactive | **Implemented** |
| Jobs sheet CustomerID | **Inferred from Assignments**; add column if inference fails |
| Pay/bill rate update policy | Unchanged — updates when present in paste |
| Cross-week open assignment constraint | Deferred to pilot |
| Week lock after closeout | Future scope |
| AR + Report Menu | Phase 2 |

Manual tests: [DATA-IMPORT-TEST-CHECKLIST.md](./DATA-IMPORT-TEST-CHECKLIST.md)

Sample rows: [DATA-IMPORT-SAMPLES.md](./DATA-IMPORT-SAMPLES.md)

Column mapping: [mc-labor-access-analysis/08_IMPORT_EXPORT_MAPPING.md](./mc-labor-access-analysis/08_IMPORT_EXPORT_MAPPING.md)

---

## Staging checklist

1. `supabase db push` (portal DB only)
2. Open `/data-import` → **Weekly Workbook**
3. Select week ending **2026-06-19** for sample file
4. Upload `docs/2026-06-19 Sample Imports.xlsx`
5. Review validation, previews, and counts (preview treats IDs from earlier sheets in the workbook as known)
6. Resolve any assignment conflicts
7. Confirm import on **staging only**

Requires migration `20250628000001_import_workbook_preview.sql` (`supabase db push`).
