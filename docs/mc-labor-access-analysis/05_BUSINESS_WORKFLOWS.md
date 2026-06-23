# Business Workflows — MC Labor Access Analysis

## Weekly full import

Raymond's master system (legacy Access/SQL Server) remains the **source of truth**. The admin portal provides a controlled import layer:

1. Copy/paste from master system exports
2. Upsert by master ID (Employee ID, Customer ID, Job ID)
3. Preserve portal-only changes where documented (e.g. manual employee Inactive without Status in paste)

## Import order

Always import in this sequence:

1. **Employees**
2. **Customers**
3. **Jobs** (requires Customer ID)
4. **Assignments** (requires Employee, Customer, Job; select working week)

Assignments are imported **last** because they depend on all reference data.

## Working week (Sat–Fri)

MC Labor payroll/operations week runs **Saturday through Friday**, week **ending Friday**.

- **Current Week** — default for mid-week imports
- **Next Week** — used when planning on **Friday or Saturday** for the upcoming week
- **Custom** — pick any week-ending Friday for corrections or backfills

Assignment conflict detection is scoped to the selected week only.

## Assignment conflict workflow

When an employee already has an overlapping assignment on another job during the selected week:

- **Skip** — leave existing assignment; do not create new
- **Move** — admin sets end date on old assignment and start date on new assignment

## Manual employee deactivation

Admins can toggle Active/Inactive on the Employees page. Weekly employee re-import **without** a Status column preserves manual Inactive status.

## Not in scope (this phase)

- Automated sync from SQL Server
- Week lock after Friday closeout
- Cross-week auto-end of stale open assignments (deferred to pilot)
