alter table public.employees
  add column if not exists manual_timesheet_enabled boolean not null default false;

comment on column public.employees.manual_timesheet_enabled is
  'Controls whether this worker can see and use the standalone Manual Timesheet tab.';

create or replace function public.enforce_manual_timesheet_access()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_standalone_manual
     and public.get_my_role() = 'WORKER'
     and not exists (
       select 1
       from public.employees employee
       where employee.id = public.get_my_employee_id()
         and employee.manual_timesheet_enabled
     ) then
    raise exception 'Manual timesheet access is not enabled for this employee';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_manual_timesheet_access() from public;

drop trigger if exists enforce_manual_timesheet_access on public.timesheets;
create trigger enforce_manual_timesheet_access
before insert or update of is_standalone_manual on public.timesheets
for each row execute function public.enforce_manual_timesheet_access();
