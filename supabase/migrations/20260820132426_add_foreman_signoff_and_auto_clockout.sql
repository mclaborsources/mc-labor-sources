alter table public.timesheet_signatures
  add column if not exists foreman_phone text,
  add column if not exists foreman_notes text;

comment on column public.timesheet_signatures.foreman_phone is
  'Foreman cell/contact number captured at the time the timesheet was signed.';
comment on column public.timesheet_signatures.foreman_notes is
  'Foreman note captured as part of the immutable timesheet sign-off.';

alter table public.attendance_logs
  add column if not exists automatically_clocked_out boolean not null default false,
  add column if not exists automatically_clocked_out_at timestamptz;

comment on column public.attendance_logs.automatically_clocked_out is
  'True when the server closed an open attendance record at the 12-hour safety limit.';

create index if not exists attendance_logs_overdue_clockout_idx
  on public.attendance_logs (clock_in_time)
  where status = 'CLOCKED_IN' and clock_out_time is null;

drop function if exists public.sign_timesheet(uuid, text, text, text);

create or replace function public.sign_timesheet(
  p_timesheet_id uuid,
  p_foreman_name text,
  p_foreman_email text,
  p_signature_image_url text,
  p_foreman_phone text default '',
  p_foreman_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timesheet public.timesheets%rowtype;
begin
  if p_foreman_name is null or trim(p_foreman_name) = '' then
    raise exception 'Foreman name is required';
  end if;

  if p_signature_image_url is null or trim(p_signature_image_url) = '' then
    raise exception 'Signature image URL is required';
  end if;

  select * into v_timesheet
  from public.timesheets
  where id = p_timesheet_id;

  if not found then
    raise exception 'Timesheet not found';
  end if;

  if not public.is_supervisor_of_job_site(v_timesheet.job_site_id)
     and v_timesheet.employee_id is distinct from public.get_my_employee_id() then
    raise exception 'Not authorized to sign this timesheet';
  end if;

  if v_timesheet.status not in ('DRAFT', 'SUBMITTED') then
    raise exception 'Timesheet has already been signed';
  end if;

  insert into public.timesheet_signatures (
    timesheet_id,
    foreman_name,
    foreman_email,
    foreman_phone,
    foreman_notes,
    signature_image_url,
    signed_at
  ) values (
    p_timesheet_id,
    trim(p_foreman_name),
    nullif(trim(coalesce(p_foreman_email, '')), ''),
    nullif(trim(coalesce(p_foreman_phone, '')), ''),
    nullif(trim(coalesce(p_foreman_notes, '')), ''),
    trim(p_signature_image_url),
    now()
  );

  update public.timesheets
  set status = 'SIGNED', updated_at = now()
  where id = p_timesheet_id;

  return p_timesheet_id;
end;
$$;

revoke all on function public.sign_timesheet(uuid, text, text, text, text, text) from public;
revoke all on function public.sign_timesheet(uuid, text, text, text, text, text) from anon;
grant execute on function public.sign_timesheet(uuid, text, text, text, text, text) to authenticated;

-- Retain worker/admin authorization for API calls while allowing a database
-- scheduler (which has no JWT identity) to refresh the generated timesheet.
create or replace function public.upsert_daily_timesheet_from_attendance(
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
  v_end_time text;
begin
  select * into v_att
  from public.attendance_logs
  where id = p_attendance_log_id;

  if not found then raise exception 'Attendance log not found'; end if;

  if auth.uid() is not null
     and not public.is_admin()
     and v_att.employee_id is distinct from public.get_my_employee_id() then
    raise exception 'Not authorized';
  end if;

  if v_att.clock_out_time is null then raise exception 'Attendance not clocked out'; end if;
  if v_att.assignment_id is null then raise exception 'Attendance must belong to an assignment'; end if;

  v_work_date := (v_att.clock_in_time at time zone 'America/New_York')::date;
  v_week_start := v_work_date - ((extract(dow from v_work_date)::integer + 1) % 7);
  v_week_end := v_week_start + 6;
  v_start_time := to_char(v_att.clock_in_time at time zone 'America/New_York', 'HH24:MI');
  v_end_time := to_char(v_att.clock_out_time at time zone 'America/New_York', 'HH24:MI');

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
    v_timesheet_id, v_work_date, v_start_time, v_end_time, 0,
    coalesce(v_att.total_hours, 0), p_attendance_log_id,
    case when v_att.automatically_clocked_out
      then 'Automatically clocked out after 12 hours'
      else 'Imported from recorded attendance'
    end
  )
  on conflict (attendance_log_id) where attendance_log_id is not null
  do update set
    timesheet_id = excluded.timesheet_id,
    work_date = excluded.work_date,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    hours = excluded.hours,
    notes = excluded.notes,
    updated_at = now();

  update public.timesheets
  set total_hours = (
        select coalesce(sum(hours), 0)
        from public.timesheet_entries
        where timesheet_id = v_timesheet_id
      ),
      updated_at = now()
  where id = v_timesheet_id;

  return v_timesheet_id;
end;
$$;

revoke all on function public.upsert_daily_timesheet_from_attendance(uuid) from public;
revoke all on function public.upsert_daily_timesheet_from_attendance(uuid) from anon;
grant execute on function public.upsert_daily_timesheet_from_attendance(uuid) to authenticated;

create or replace function public.auto_clock_out_overdue_attendance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attendance_id uuid;
  v_closed_count integer := 0;
begin
  for v_attendance_id in
    update public.attendance_logs
    set clock_out_time = clock_in_time + interval '12 hours',
        total_hours = 12,
        status = 'CLOCKED_OUT',
        automatically_clocked_out = true,
        automatically_clocked_out_at = now(),
        clock_out_location_label = 'Automatically clocked out after 12 hours',
        updated_at = now()
    where status = 'CLOCKED_IN'
      and clock_out_time is null
      and clock_in_time <= now() - interval '12 hours'
    returning id
  loop
    perform public.upsert_daily_timesheet_from_attendance(v_attendance_id);
    v_closed_count := v_closed_count + 1;
  end loop;

  return v_closed_count;
end;
$$;

revoke all on function public.auto_clock_out_overdue_attendance() from public;
revoke all on function public.auto_clock_out_overdue_attendance() from anon;
revoke all on function public.auto_clock_out_overdue_attendance() from authenticated;

-- pg_cron jobs must be managed through cron.schedule/cron.unschedule rather
-- than direct writes to cron.job.
create extension if not exists pg_cron;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'auto-clock-out-after-12-hours'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'auto-clock-out-after-12-hours',
    '*/5 * * * *',
    'select public.auto_clock_out_overdue_attendance()'
  );
end;
$$;
