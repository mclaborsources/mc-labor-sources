alter table public.job_sites add column if not exists is_training boolean not null default false;
alter table public.job_assignments add column if not exists is_training boolean not null default false;
alter table public.timesheets add column if not exists is_training boolean not null default false;

create unique index if not exists job_sites_single_training_site_idx
  on public.job_sites (is_training) where is_training;

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
  if not exists (select 1 from public.employees where id = p_employee_id and status = 'ACTIVE') then
    raise exception 'Active employee not found';
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
      (p_employee_id, v_customer_id, v_job_site_id, v_week_start, '08:00',
       '16:00', 'ACTIVE',
       'Training assignment — excluded from operational reporting and customer delivery.',
       true)
    returning id into v_assignment_id;
  end if;

  if v_timesheet_id is null then
    insert into public.timesheets
      (employee_id, customer_id, job_site_id, assignment_id, week_start_date,
       week_end_date, total_hours, notes, status, is_training)
    values
      (p_employee_id, v_customer_id, v_job_site_id, v_assignment_id,
       v_week_start, v_week_end, 40,
       'Training timesheet — not for payroll or customer delivery.', 'DRAFT', true)
    returning id into v_timesheet_id;

    insert into public.timesheet_entries
      (timesheet_id, work_date, start_time, end_time, break_minutes, hours, notes)
    select v_timesheet_id, v_week_start + day_offset::integer, '08:00', '16:00', 0, 8,
      'Training entry'
    from generate_series(0, 4) as day_offset;
  end if;

  return json_build_object('assignmentId', v_assignment_id, 'timesheetId',
    v_timesheet_id, 'jobSiteId', v_job_site_id);
end;
$$;

revoke all on function public.create_training_assignment(uuid) from public;
revoke all on function public.create_training_assignment(uuid) from anon;
grant execute on function public.create_training_assignment(uuid) to authenticated;

create or replace function public.prevent_training_timesheet_delivery()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if exists (select 1 from public.timesheets where id = new.timesheet_id and is_training) then
    raise exception 'Training timesheets cannot be sent to customers';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_training_timesheet_delivery on public.timesheet_delivery_items;
create trigger prevent_training_timesheet_delivery before insert
on public.timesheet_delivery_items for each row
execute function public.prevent_training_timesheet_delivery();
revoke all on function public.prevent_training_timesheet_delivery() from public;

create or replace function public.get_admin_hours_report(
  p_from date,
  p_to date,
  p_customer_id uuid default null,
  p_job_site_id uuid default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare result json;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select coalesce(json_agg(row_to_json(r)), '[]'::json) into result
  from (
    select e.id as employee_id, e.first_name, e.last_name,
      c.id as customer_id, c.company_name, js.id as job_site_id,
      js.name as job_site_name,
      coalesce(sum(t.total_hours), 0)::numeric(10, 2) as total_hours,
      count(t.id)::int as timesheet_count
    from public.timesheets t
    join public.employees e on e.id = t.employee_id
    join public.job_sites js on js.id = t.job_site_id
    join public.customers c on c.id = t.customer_id
    where not t.is_training
      and (p_customer_id is null or t.customer_id = p_customer_id)
      and (p_job_site_id is null or t.job_site_id = p_job_site_id)
      and (
        (t.work_date is not null and t.work_date between p_from and p_to)
        or (t.week_start_date is not null and t.week_end_date is not null
          and t.week_start_date <= p_to and t.week_end_date >= p_from)
      )
    group by e.id, e.first_name, e.last_name, c.id, c.company_name, js.id, js.name
    order by c.company_name, js.name, e.last_name, e.first_name
  ) r;
  return result;
end;
$$;
