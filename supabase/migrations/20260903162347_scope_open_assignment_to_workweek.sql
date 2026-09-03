-- Allow an employee to have open assignments in different workweeks while
-- retaining the one-open-assignment rule inside each Sat-Fri workweek.
drop index if exists public.job_assignments_one_open_per_employee;

create unique index if not exists job_assignments_one_open_per_employee_workweek
  on public.job_assignments (
    employee_id,
    ((assigned_date - ((extract(dow from assigned_date)::integer + 1) % 7)))
  )
  where status in ('PENDING', 'ACCEPTED', 'ACTIVE');

comment on index public.job_assignments_one_open_per_employee_workweek is
  'Allows one open assignment per employee in each Saturday-Friday workweek.';
