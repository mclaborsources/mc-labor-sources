# Import / Export Mapping — Raymond Workbook ↔ Portal Parsers

Reference file: `docs/2026-06-19 Sample Imports.xlsx` (week ending 06/19/2026).

Parser entry points: `import-parsers.ts`, `excel-workbook.ts`, `paste-utils.ts`.

## Workbook structure

| Sheet name | Portal entity | Parser |
|------------|---------------|--------|
| Employees | `employees` | `parseEmployeeRows` |
| Customers | `customers` | `parseCustomerRows` |
| Jobs | `job_sites` | `parseJobRows` + CustomerID enrichment |
| Assignments | `job_assignments` | `parseAssignmentRows` |

Upload flow: `WorkbookImportWorkflow` → validate → preview → commit in sheet order.

---

## Employees sheet

| Export column | RPC field | Notes |
|---------------|-----------|-------|
| EmployeeID | `master_employee_id` | Required |
| EmFirstName | `first_name` | Required |
| EmLastName | `last_name` | Required |
| EmMobilePhone | `phone` | Optional |
| EmEmail | `email` | Optional |
| Trade | `position` | Optional |
| PayRate | `hourly_rate` | Optional |
| BillRate | `bill_rate` | Optional |
| Status | `status` | **Not in sample workbook** — optional; omit to preserve manual Inactive |

Legacy paste aliases (First Name, Employee ID, etc.) still supported.

---

## Customers sheet

| Export column | RPC field | Notes |
|---------------|-----------|-------|
| CustomerID | `master_customer_id` | Required |
| CustBusName | `company_name` | Required |
| CustomerType | `customer_type` | Optional |
| Salesman | `salesman` | Optional |
| Street, City, State, Zip | address fields | Optional |
| CustomerContactFName01 … 10 | `contacts` JSON | First/last/title/email/cell/office per slot |
| CustomerContactLName01 | | |
| CustomerContactTitle01 | | |
| CustomerContactEmail01 | | |
| CustomerContactCell01 | | |
| CustomerContactOfficePhone01 | | |

---

## Jobs sheet

| Export column | RPC field | Notes |
|---------------|-----------|-------|
| ProjectID | `master_job_id` | Required — Raymond “job” key |
| SiteName | `name` | Required |
| SiteStreet | `address` | Optional |
| SiteCity | `city` | Optional |
| SiteState | `state` | Optional |
| StartDate | `start_date` | Excel date → ISO (e.g. `12/7/15`) |
| CustomerForeman | `foreman_name` / `foremen[0]` | Optional |
| CustomerForemanEmail | `foreman_email` | Optional |
| CustomerForemanPhone | `foreman_phone` | Optional |
| CustomerID | `master_customer_id` | **Not in Raymond export** |

### CustomerID on Jobs

Raymond’s weekly Jobs sheet has **no CustomerID**. Portal import:

1. Build `ProjectID → CustomerID` map from **Assignments** sheet
2. Apply to each job row before validation/import
3. If still missing: block import with error — add CustomerID to Jobs sheet or fix Assignments

---

## Assignments sheet

| Export column | RPC field | Notes |
|---------------|-----------|-------|
| CustomerID | `master_customer_id` | Required |
| ProjectID | `master_job_id` | Required |
| EmployeeID | `master_employee_id` | Required |

Working week is selected in UI (`WorkingWeekSelector`), not in the sheet.

Cross-sheet validation (`import-validation.ts`):

- Each EmployeeID ∈ Employees sheet ∪ portal employees
- Each CustomerID ∈ Customers sheet ∪ portal customers
- Each ProjectID ∈ Jobs sheet ∪ portal job_sites

---

## Export (future)

Bidirectional export out of scope. See `09_MODERN_FRONTEND_SCOPE.md`.
