-- Remove every operational record owned by a Sat-Fri work week. In addition to
-- normal dated timesheets, include legacy rows identified only by assignment.
create or replace function public.clear_import_week(
  p_week_end date,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_start date;
  v_assignment_ids uuid[] := array[]::uuid[];
  v_timesheet_ids uuid[] := array[]::uuid[];
  v_batch_ids uuid[] := array[]::uuid[];
  v_delivery_items int := 0;
  v_delivery_batches int := 0;
  v_email_logs int := 0;
  v_workflow_audit int := 0;
  v_entries int := 0;
  v_signatures int := 0;
  v_attendance int := 0;
  v_timesheets int := 0;
  v_assignments int := 0;
  v_import_runs int := 0;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_week_end is null or extract(isodow from p_week_end) <> 5 then
    raise exception 'Week ending date must be a Friday';
  end if;
  if trim(coalesce(p_confirmation, '')) <> '3360' then
    raise exception 'Invalid deletion code';
  end if;

  v_week_start := p_week_end - 6;

  select coalesce(array_agg(assignment.id), array[]::uuid[])
  into v_assignment_ids
  from public.job_assignments assignment
  where assignment.assigned_date <= p_week_end
    and coalesce(assignment.end_date, assignment.assigned_date) >= v_week_start;

  select coalesce(array_agg(timesheet.id), array[]::uuid[])
  into v_timesheet_ids
  from public.timesheets timesheet
  where timesheet.work_date between v_week_start and p_week_end
     or (
       timesheet.week_start_date <= p_week_end
       and timesheet.week_end_date >= v_week_start
     )
     or timesheet.assignment_id = any(v_assignment_ids);

  select coalesce(array_agg(distinct item.batch_id), array[]::uuid[])
  into v_batch_ids
  from public.timesheet_delivery_items item
  where item.timesheet_id = any(v_timesheet_ids);

  select count(*)::int into v_entries
  from public.timesheet_entries entry
  where entry.timesheet_id = any(v_timesheet_ids);

  select count(*)::int into v_signatures
  from public.timesheet_signatures signature
  where signature.timesheet_id = any(v_timesheet_ids);

  with deleted as (
    delete from public.timesheet_workflow_audit audit
    where audit.timesheet_id = any(v_timesheet_ids)
    returning 1
  ) select count(*)::int into v_workflow_audit from deleted;

  -- Timesheet email logs use the first timesheet id as related_id.
  with deleted as (
    delete from public.email_delivery_log email_log
    where email_log.related_id = any(v_timesheet_ids)
      and email_log.template like 'TIMESHEET%'
    returning 1
  ) select count(*)::int into v_email_logs from deleted;

  with deleted as (
    delete from public.timesheet_delivery_items item
    where item.timesheet_id = any(v_timesheet_ids)
    returning 1
  ) select count(*)::int into v_delivery_items from deleted;

  update public.timesheet_delivery_batches batch
  set timesheet_count = (
    select count(*)::int
    from public.timesheet_delivery_items item
    where item.batch_id = batch.id
  )
  where batch.id = any(v_batch_ids)
    and exists (
      select 1 from public.timesheet_delivery_items item where item.batch_id = batch.id
    );

  with deleted as (
    delete from public.timesheet_delivery_batches batch
    where batch.id = any(v_batch_ids)
      and not exists (
        select 1 from public.timesheet_delivery_items item where item.batch_id = batch.id
      )
    returning 1
  ) select count(*)::int into v_delivery_batches from deleted;

  with deleted as (
    delete from public.timesheets timesheet
    where timesheet.id = any(v_timesheet_ids)
    returning 1
  ) select count(*)::int into v_timesheets from deleted;

  -- Attendance is recorded in Eastern Time throughout the timesheet workflow.
  -- The assignment match also catches legacy/malformed timestamps.
  with deleted as (
    delete from public.attendance_logs attendance
    where (attendance.clock_in_time at time zone 'America/New_York')::date
            between v_week_start and p_week_end
       or attendance.assignment_id = any(v_assignment_ids)
    returning 1
  ) select count(*)::int into v_attendance from deleted;

  with deleted as (
    delete from public.job_assignments assignment
    where assignment.id = any(v_assignment_ids)
    returning 1
  ) select count(*)::int into v_assignments from deleted;

  with deleted as (
    delete from public.data_import_runs import_run
    where import_run.week_start_date = v_week_start
      and import_run.week_end_date = p_week_end
    returning 1
  ) select count(*)::int into v_import_runs from deleted;

  return jsonb_build_object(
    'cleared', true,
    'weekStart', v_week_start,
    'weekEnd', p_week_end,
    'counts', jsonb_build_object(
      'deliveryItems', v_delivery_items,
      'deliveryBatches', v_delivery_batches,
      'emailLogs', v_email_logs,
      'workflowAuditLogs', v_workflow_audit,
      'timesheetEntries', v_entries,
      'timesheetSignatures', v_signatures,
      'attendanceLogs', v_attendance,
      'timesheets', v_timesheets,
      'assignments', v_assignments,
      'importRuns', v_import_runs
    )
  );
end;
$$;

revoke all on function public.clear_import_week(date, text) from public, anon;
grant execute on function public.clear_import_week(date, text) to authenticated;
