alter table public.employees
  add column if not exists is_training_account boolean not null default false;

alter table public.users
  add column if not exists is_training_account boolean not null default false;

create index if not exists employees_training_accounts_idx
  on public.employees (is_training_account, status);

comment on column public.employees.is_training_account is
  'Separates temporary training identities from the operational workforce.';
comment on column public.users.is_training_account is
  'Marks portal identities that may access training work only.';

create or replace function public.enforce_training_assignment_isolation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_training_employee boolean;
begin
  select is_training_account into v_training_employee
  from public.employees where id = new.employee_id;

  if coalesce(v_training_employee, false) is distinct from new.is_training then
    raise exception 'Training accounts may only use training assignments';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_training_assignment_isolation
  on public.job_assignments;
create trigger enforce_training_assignment_isolation
before insert or update of employee_id, is_training
on public.job_assignments
for each row execute function public.enforce_training_assignment_isolation();

revoke all on function public.enforce_training_assignment_isolation() from public;

create or replace function public.get_admin_dashboard_stats()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
  day_start timestamptz;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  day_start := date_trunc('day', now());
  select json_build_object(
    'totalEmployees', (
      select count(*)::int from public.employees
      where status = 'ACTIVE' and not is_training_account
    ),
    'activeJobSites', (
      select count(*)::int from public.job_sites
      where status = 'ACTIVE' and not is_training
    ),
    'clockedInToday', (
      select count(*)::int from public.attendance_logs al
      join public.employees e on e.id = al.employee_id
      where al.status = 'CLOCKED_IN' and al.clock_in_time >= day_start
        and not e.is_training_account
    ),
    'pendingJobOrders', (
      select count(*)::int from public.job_orders where status in ('DRAFT', 'SENT')
    ),
    'signedTimesheets', (
      select count(*)::int from public.timesheets
      where status in ('SIGNED', 'SENT', 'APPROVED') and not is_training
    )
  ) into result;
  return result;
end;
$$;
