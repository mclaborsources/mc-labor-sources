# Data Import — Master System Paste Workflow

## Reply to Raymond (draft)

Hi Raymond,

Thanks for the detailed direction — I understand the goal clearly.

Your master system should remain the source of truth. The portal can act as a controlled import layer: you copy/paste from the master system, and we preserve your original Employee IDs, Customer IDs, Job IDs, and assignment structure inside the app.

We added an Admin-only **Data Import** area with separate flows for Employees, Customers, Jobs, and Assignments. Assignment import includes explicit conflict handling when an employee is already assigned elsewhere — we do not silently overwrite active assignments.

Before finalizing parsing rules, please send sample rows copied directly from the master system (fake/scrubbed names are fine):

- 5 sample employee rows
- 2 sample customer rows with contacts
- 2 sample job rows with foremen
- 5 sample assignment rows (include at least one conflict case)

Please also confirm:

- Exact field names for Employee ID, Customer ID, and Job ID
- Whether IDs are ever changed in the master system
- Valid employee and job statuses (we default to Active / Inactive)
- When moving an employee: should the old assignment end the day before the new start, or the same day?
- Should pay rate and bill rate update on every paste, or only on initial import?
- Should inactive employees be hidden from assignment dropdowns? (We default to yes.)

Best,

---

## Admin access

**Data Import** is available only to `ADMIN` and `SUPER_ADMIN` roles via `/data-import`. Supervisors and customers cannot access it.

## Import order

1. Employees
2. Customers
3. Jobs (requires Customer ID to exist)
4. Assignments (requires Employee, Customer, and Job IDs)

## Paste format

### Employees (multiple rows)

Tab- or comma-separated. Header row optional.

| Employee ID | First Name | Last Name | Cell | Email | Trade / Position | Pay Rate | Bill Rate | Status |
|-------------|------------|-----------|------|-------|------------------|----------|-----------|--------|

### Customers (one wide row)

| Customer ID | Customer Type | Name | Salesman | Street | City | State | Zip | Contact 1 First Name | ... |

Up to 10 contacts: `Contact N First Name`, `Contact N Last Name`, `Contact N Title`, `Contact N Email`, `Contact N Cell`, `Contact N Office Phone`

### Jobs (one wide row)

| Job ID | Job Name | Street | City | State | Start Date | Status | Customer ID | Foreman 1 Name | ... |

Up to 20 foremen: `Foreman N Name`, `Foreman N Email`, `Foreman N Cell`, `Foreman N Office Phone`

### Assignments (multiple rows)

| Customer ID | Job ID | Job Name | Employee ID | First Name | Last Name |

## Conflict handling (assignments)

If an employee already has an active assignment, the preview shows a conflict. Choose:

- **Skip** — do not import this row
- **Move** — end the current assignment (with end date) and create a new active assignment (with start date)

Completed assignments remain in history.

## Production import checklist

1. Back up Supabase (point-in-time recovery or export)
2. Import 5 sample employees → review
3. Import sample customers → review
4. Import sample jobs → review
5. Import sample assignments → verify conflict workflow
6. Proceed with larger imports in order above

## Import history

View past imports at `/data-import/history` — type, admin user, counts, and error details.
