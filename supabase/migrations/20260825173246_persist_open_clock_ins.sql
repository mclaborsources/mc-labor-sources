-- Create the draft timesheet entry as soon as an employee clocks in. Clock-out
-- later updates this same entry through upsert_daily_timesheet_from_attendance.

create or replace function public.upsert_open_timesheet_from_attendance(
  p_attendance_log_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_att public.attendance_logs%rowtype;
  v_work_date date;
  v_week_start date;
  v_week_end date;
  v_timesheet_id uuid;
  v_start_time text;
begin
  select * into v_att
  from public.attendance_logs
  where id = p_attendance_log_id;

  if not found then raise exception 'Attendance log not found'; end if;
  if not public.is_admin()
     and v_att.employee_id is distinct from public.get_my_employee_id() then
    raise exception 'Not authorized';
  end if;
  if v_att.assignment_id is null then
    raise exception 'Attendance must belong to an assignment';
  end if;

  v_work_date := (v_att.clock_in_time at time zone 'America/New_York')::date;
  v_week_start := v_work_date - ((extract(dow from v_work_date)::integer + 1) % 7);
  v_week_end := v_week_start + 6;
  v_start_time := to_char(v_att.clock_in_time at time zone 'America/New_York', 'HH24:MI');

  select id into v_timesheet_id
  from public.timesheets
  where assignment_id = v_att.assignment_id
    and employee_id = v_att.employee_id
    and week_start_date = v_week_start
    and week_end_date = v_week_end
    and status = 'DRAFT'
  order by created_at desc
  limit 1;

  if v_timesheet_id is null then
    insert into public.timesheets (
      employee_id, customer_id, job_site_id, assignment_id,
      week_start_date, week_end_date, work_date, total_hours, status
    ) values (
      v_att.employee_id, v_att.customer_id, v_att.job_site_id, v_att.assignment_id,
      v_week_start, v_week_end, null, 0, 'DRAFT'
    ) returning id into v_timesheet_id;
  end if;

  insert into public.timesheet_entries (
    timesheet_id, work_date, start_time, end_time, break_minutes,
    hours, attendance_log_id, notes
  ) values (
    v_timesheet_id, v_work_date, v_start_time, '', 0,
    0, p_attendance_log_id, 'Active clock-in'
  )
  on conflict (attendance_log_id) where attendance_log_id is not null
  do update set
    timesheet_id = excluded.timesheet_id,
    work_date = excluded.work_date,
    start_time = excluded.start_time,
    updated_at = now();

  return v_timesheet_id;
end;
$$;

revoke all on function public.upsert_open_timesheet_from_attendance(uuid) from public;
revoke all on function public.upsert_open_timesheet_from_attendance(uuid) from anon;
grant execute on function public.upsert_open_timesheet_from_attendance(uuid) to authenticated;
