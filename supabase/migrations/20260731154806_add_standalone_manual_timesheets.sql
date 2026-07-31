-- Standalone manual timesheets are created by workers without being attached
-- to a job assignment. Customer/job foreign keys retain internal reporting
-- context from the worker's latest assignment while these snapshot columns
-- preserve the employee-editable labels shown on the submitted timesheet.

alter table public.timesheets
  add column if not exists is_standalone_manual boolean not null default false,
  add column if not exists manual_company_name text,
  add column if not exists manual_job_name text,
  add column if not exists manual_job_address text,
  add column if not exists manual_foreman_name text;

create index if not exists timesheets_employee_manual_week_idx
  on public.timesheets (employee_id, is_standalone_manual, week_start_date, created_at desc);

create or replace function public.save_my_standalone_manual_timesheet(
  p_week_start date,
  p_week_end date,
  p_company_name text,
  p_job_name text,
  p_job_address text,
  p_foreman_name text,
  p_entries jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_latest_assignment public.job_assignments%rowtype;
  v_timesheet_id uuid;
  v_entry jsonb;
  v_work_date date;
  v_hours numeric(5, 2);
  v_total numeric(5, 2) := 0;
  v_entry_count integer;
  v_distinct_date_count integer;
begin
  if public.get_my_role() is distinct from 'WORKER' then
    raise exception 'Worker access required';
  end if;

  v_employee_id := public.get_my_employee_id();
  if v_employee_id is null then
    raise exception 'Employee profile required';
  end if;

  if p_week_end <> p_week_start + 6 or extract(dow from p_week_start) <> 6 then
    raise exception 'Timesheet period must run Saturday through Friday';
  end if;

  if nullif(trim(coalesce(p_company_name, '')), '') is null
     or nullif(trim(coalesce(p_job_name, '')), '') is null
     or nullif(trim(coalesce(p_job_address, '')), '') is null then
    raise exception 'Company, job name, and job address are required';
  end if;

  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Timesheet entries must be an array';
  end if;

  select count(*), count(distinct (entry.value->>'workDate'))
  into v_entry_count, v_distinct_date_count
  from jsonb_array_elements(p_entries) as entry(value);

  if v_entry_count <> 7 or v_distinct_date_count <> 7 then
    raise exception 'Exactly one entry is required for each day of the selected week';
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    begin
      v_work_date := (v_entry->>'workDate')::date;
      v_hours := round((v_entry->>'hours')::numeric, 2);
    exception when others then
      raise exception 'Every entry must contain a valid date and hour value';
    end;

    if v_work_date < p_week_start or v_work_date > p_week_end then
      raise exception 'Entry date is outside the selected week';
    end if;
    if v_hours < 0 or v_hours > 24 or mod(v_hours, 0.25) <> 0 then
      raise exception 'Hours must use quarter-hour increments between 0 and 24';
    end if;

    v_total := v_total + v_hours;
  end loop;

  if v_total <= 0 then
    raise exception 'Enter hours for at least one day';
  end if;

  select assignment.*
  into v_latest_assignment
  from public.job_assignments assignment
  where assignment.employee_id = v_employee_id
  order by assignment.assigned_date desc, assignment.created_at desc
  limit 1;

  if not found then
    raise exception 'A previous assignment is required to create a manual timesheet';
  end if;

  insert into public.timesheets (
    employee_id,
    customer_id,
    job_site_id,
    assignment_id,
    week_start_date,
    week_end_date,
    total_hours,
    notes,
    status,
    is_standalone_manual,
    manual_company_name,
    manual_job_name,
    manual_job_address,
    manual_foreman_name
  ) values (
    v_employee_id,
    v_latest_assignment.customer_id,
    v_latest_assignment.job_site_id,
    null,
    p_week_start,
    p_week_end,
    v_total,
    nullif(trim(coalesce(p_notes, '')), ''),
    'DRAFT',
    true,
    trim(p_company_name),
    trim(p_job_name),
    trim(p_job_address),
    nullif(trim(coalesce(p_foreman_name, '')), '')
  ) returning id into v_timesheet_id;

  insert into public.timesheet_entries (
    timesheet_id,
    work_date,
    start_time,
    end_time,
    break_minutes,
    hours,
    attendance_log_id,
    notes
  )
  select
    v_timesheet_id,
    (entry.value->>'workDate')::date,
    'Manual',
    'Manual',
    0,
    round((entry.value->>'hours')::numeric, 2),
    null,
    'Standalone manual entry'
  from jsonb_array_elements(p_entries) as entry(value)
  where (entry.value->>'hours')::numeric > 0;

  return v_timesheet_id;
end;
$$;

revoke all on function public.save_my_standalone_manual_timesheet(
  date, date, text, text, text, text, jsonb, text
) from public;
revoke all on function public.save_my_standalone_manual_timesheet(
  date, date, text, text, text, text, jsonb, text
) from anon;
grant execute on function public.save_my_standalone_manual_timesheet(
  date, date, text, text, text, text, jsonb, text
) to authenticated;

comment on function public.save_my_standalone_manual_timesheet(
  date, date, text, text, text, text, jsonb, text
) is 'Creates a worker-owned manual weekly timesheet independent of any assignment.';
