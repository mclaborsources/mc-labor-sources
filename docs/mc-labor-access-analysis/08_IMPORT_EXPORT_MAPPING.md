# Import / Export Mapping — Raymond CSV ↔ Portal Parsers

Mapping between Raymond master system export columns and admin-web import parsers.

Parser entry points: `apps/admin-web/src/components/import/import-parsers.ts`, `paste-utils.ts`.

## Employees

| Raymond / export column | Parser alias | RPC field | Notes |
|-------------------------|--------------|-----------|-------|
| Employee ID | employee id, employeeid, emp id | `master_employee_id` | Required |
| First Name | first name, firstname, fname | `first_name` | Required |
| Last Name | last name, lastname, lname | `last_name` | Required |
| Cell / Phone | cell, phone, mobile | `phone` | Optional |
| Email | email | `email` | Optional; validated |
| Trade / Position | trade, position, job title | `position` | Optional |
| Pay Rate | pay rate, hourly rate | `hourly_rate` | Optional; `$` stripped |
| Bill Rate | bill rate | `bill_rate` | Optional |
| Status | status | `status` | **Optional** — omitted if column absent or blank/unrecognized |

NULL literals (`NULL`, `N/A`, `#N/A`, etc.) treated as blank via `normalizePasteCell`.

## Customers

| Raymond column | RPC field | Notes |
|----------------|-----------|-------|
| Customer ID | `master_customer_id` | Required |
| Name | `company_name` | Required |
| Customer Type | `customer_type` | Optional |
| Salesman | `salesman` | Optional |
| Street, City, State, Zip | address fields | Optional |
| Contact N * | `contacts` JSON | Up to 10 contacts |

## Jobs

| Raymond column | RPC field | Notes |
|----------------|-----------|-------|
| Job ID | `master_job_id` | Required |
| Customer ID | `master_customer_id` | Required for link |
| Job Name | `name` | Required |
| Start Date | `start_date` | Datetime OK — date portion used |
| Status | `status` | Defaults Active |
| Foreman N Name/Email/Cell | `foremen` JSON + top-level foreman fields | Up to 20 |

## Assignments

| Raymond column | RPC field | Notes |
|----------------|-----------|-------|
| Employee ID | `master_employee_id` | Required |
| Customer ID | `master_customer_id` | Required |
| Job ID | `master_job_id` | Required |
| Tracking ID | `master_assignment_id` | Optional |
| Assigned Date | `assigned_date` | Optional; defaults today on create |

Week context is **not** in the CSV — admin selects working week in UI (`WorkingWeekSelector`).

## Export (future)

Full bidirectional export mapping is out of scope for this phase. See `09_MODERN_FRONTEND_SCOPE.md` for planned reporting exports.
