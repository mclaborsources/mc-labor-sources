-- Keep attendance events separate while aggregating their hours into one
-- Saturday-Friday draft timesheet per assignment.
-- The existing function name is retained so deployed clients remain compatible.

CREATE OR REPLACE FUNCTION public.upsert_daily_timesheet_from_attendance(
  p_attendance_log_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_att public.attendance_logs%ROWTYPE;
  v_work_date date;
  v_week_start date;
  v_week_end date;
  v_timesheet_id uuid;
  v_start_time text;
  v_end_time text;
BEGIN
  SELECT *
  INTO v_att
  FROM public.attendance_logs
  WHERE id = p_attendance_log_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Attendance log not found';
  END IF;

  IF NOT public.is_admin()
     AND v_att.employee_id IS DISTINCT FROM public.get_my_employee_id() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_att.clock_out_time IS NULL THEN
    RAISE EXCEPTION 'Attendance not clocked out';
  END IF;

  IF v_att.assignment_id IS NULL THEN
    RAISE EXCEPTION 'Attendance must belong to an assignment';
  END IF;

  v_work_date := (v_att.clock_in_time AT TIME ZONE 'America/New_York')::date;
  v_week_start := v_work_date - ((EXTRACT(DOW FROM v_work_date)::integer + 1) % 7);
  v_week_end := v_week_start + 6;
  v_start_time := to_char(v_att.clock_in_time AT TIME ZONE 'America/New_York', 'HH24:MI');
  v_end_time := to_char(v_att.clock_out_time AT TIME ZONE 'America/New_York', 'HH24:MI');

  SELECT id
  INTO v_timesheet_id
  FROM public.timesheets
  WHERE assignment_id = v_att.assignment_id
    AND employee_id = v_att.employee_id
    AND week_start_date = v_week_start
    AND week_end_date = v_week_end
    AND status = 'DRAFT'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_timesheet_id IS NULL THEN
    INSERT INTO public.timesheets (
      employee_id,
      customer_id,
      job_site_id,
      assignment_id,
      week_start_date,
      week_end_date,
      work_date,
      total_hours,
      status
    )
    VALUES (
      v_att.employee_id,
      v_att.customer_id,
      v_att.job_site_id,
      v_att.assignment_id,
      v_week_start,
      v_week_end,
      NULL,
      0,
      'DRAFT'
    )
    RETURNING id INTO v_timesheet_id;
  END IF;

  INSERT INTO public.timesheet_entries (
    timesheet_id,
    work_date,
    start_time,
    end_time,
    break_minutes,
    hours,
    attendance_log_id,
    notes
  )
  VALUES (
    v_timesheet_id,
    v_work_date,
    v_start_time,
    v_end_time,
    0,
    COALESCE(v_att.total_hours, 0),
    p_attendance_log_id,
    'Imported from recorded attendance'
  )
  ON CONFLICT (attendance_log_id) WHERE attendance_log_id IS NOT NULL
  DO UPDATE SET
    timesheet_id = EXCLUDED.timesheet_id,
    work_date = EXCLUDED.work_date,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    hours = EXCLUDED.hours,
    notes = EXCLUDED.notes,
    updated_at = now();

  UPDATE public.timesheets
  SET total_hours = (
        SELECT COALESCE(SUM(hours), 0)
        FROM public.timesheet_entries
        WHERE timesheet_id = v_timesheet_id
      ),
      updated_at = now()
  WHERE id = v_timesheet_id;

  RETURN v_timesheet_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_daily_timesheet_from_attendance(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_daily_timesheet_from_attendance(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_daily_timesheet_from_attendance(uuid) TO authenticated;
