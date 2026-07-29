delete from public.timesheet_entries entry
using public.timesheets timesheet
where entry.timesheet_id = timesheet.id
  and timesheet.is_training
  and timesheet.status = 'DRAFT'
  and entry.notes = 'Training entry';

update public.timesheets timesheet
set total_hours = (
      select coalesce(sum(entry.hours), 0)
      from public.timesheet_entries entry
      where entry.timesheet_id = timesheet.id
    ),
    updated_at = now()
where timesheet.is_training
  and timesheet.status = 'DRAFT';

create or replace function public.create_training_assignment(p_employee_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_job_site_id uuid;
  v_assignment_id uuid;
  v_timesheet_id uuid;
  v_week_start date;
  v_week_end date;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if not exists (
    select 1 from public.employees
    where id = p_employee_id
      and status = 'ACTIVE'
      and is_training_account
  ) then
    raise exception 'Active tester account not found';
  end if;

  select id, customer_id into v_job_site_id, v_customer_id
  from public.job_sites where is_training limit 1;

  if v_job_site_id is null then
    insert into public.customers (company_name, contact_name, address, status)
    values ('TRAINING CUSTOMER', 'Training Foreman', 'Internal training only', 'ACTIVE')
    returning id into v_customer_id;
    insert into public.job_sites
      (customer_id, name, address, foreman_name, status, is_training)
    values
      (v_customer_id, 'Timesheet Training Job', 'Internal training only',
       'Training Foreman', 'ACTIVE', true)
    returning id into v_job_site_id;
  end if;

  v_week_start := current_date - ((extract(dow from current_date)::integer + 1) % 7);
  v_week_end := v_week_start + 6;

  select ja.id, t.id into v_assignment_id, v_timesheet_id
  from public.job_assignments ja
  left join public.timesheets t on t.assignment_id = ja.id and t.is_training
  where ja.employee_id = p_employee_id and ja.job_site_id = v_job_site_id
    and ja.is_training and ja.assigned_date between v_week_start and v_week_end
  order by ja.created_at desc limit 1;

  if v_assignment_id is null then
    insert into public.job_assignments
      (employee_id, customer_id, job_site_id, assigned_date, start_time,
       end_time, status, notes, is_training)
    values
      (p_employee_id, v_customer_id, v_job_site_id, v_week_start, null,
       null, 'ACTIVE',
       'Training assignment — actual tester hours only.', true)
    returning id into v_assignment_id;
  end if;

  if v_timesheet_id is null then
    insert into public.timesheets
      (employee_id, customer_id, job_site_id, assignment_id, week_start_date,
       week_end_date, total_hours, notes, status, is_training)
    values
      (p_employee_id, v_customer_id, v_job_site_id, v_assignment_id,
       v_week_start, v_week_end, 0,
       'Training timesheet — actual rendered hours only.', 'DRAFT', true)
    returning id into v_timesheet_id;
  end if;

  return json_build_object('assignmentId', v_assignment_id, 'timesheetId',
    v_timesheet_id, 'jobSiteId', v_job_site_id);
end;
$$;

revoke all on function public.create_training_assignment(uuid) from public;
revoke all on function public.create_training_assignment(uuid) from anon;
grant execute on function public.create_training_assignment(uuid) to authenticated;
