-- Preserve the validated attendance reference supplied by the mobile manual
-- timesheet workflow so the admin review can display clock GPS information.

CREATE OR REPLACE FUNCTION public.save_my_manual_timesheet(
  p_assignment_id uuid,
  p_week_start date,
  p_week_end date,
  p_entries jsonb,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_assignment public.job_assignments%ROWTYPE;
  v_timesheet_id uuid;
  v_entry jsonb;
  v_work_date date;
  v_hours numeric(5, 2);
  v_attendance_id uuid;
  v_total numeric(5, 2) := 0;
BEGIN
  IF public.get_my_role() <> 'WORKER' THEN
    RAISE EXCEPTION 'Worker access required';
  END IF;

  SELECT * INTO v_assignment
  FROM public.job_assignments
  WHERE id = p_assignment_id
    AND employee_id = public.get_my_employee_id();

  IF NOT FOUND THEN RAISE EXCEPTION 'Assignment not found'; END IF;
  IF p_week_end <> p_week_start + 6 OR EXTRACT(DOW FROM p_week_start) <> 6 THEN
    RAISE EXCEPTION 'Timesheet period must run Saturday through Friday';
  END IF;
  IF jsonb_typeof(p_entries) <> 'array' THEN
    RAISE EXCEPTION 'Timesheet entries must be an array';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    v_work_date := (v_entry->>'workDate')::date;
    v_hours := ROUND((v_entry->>'hours')::numeric, 2);
    v_attendance_id := NULLIF(v_entry->>'attendanceLogId', '')::uuid;
    IF v_work_date < p_week_start OR v_work_date > p_week_end THEN
      RAISE EXCEPTION 'Entry date is outside the selected week';
    END IF;
    IF v_hours < 0 OR v_hours > 24 OR MOD(v_hours, 0.25) <> 0 THEN
      RAISE EXCEPTION 'Hours must use quarter-hour increments between 0 and 24';
    END IF;
    IF v_attendance_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.attendance_logs a
      WHERE a.id = v_attendance_id
        AND a.employee_id = v_assignment.employee_id
        AND a.customer_id = v_assignment.customer_id
        AND a.job_site_id = v_assignment.job_site_id
        AND a.assignment_id = v_assignment.id
        AND a.status = 'CLOCKED_OUT'
        AND (a.clock_in_time AT TIME ZONE 'America/New_York')::date = v_work_date
    ) THEN
      RAISE EXCEPTION 'Recorded attendance does not match this assignment';
    END IF;
    v_total := v_total + v_hours;
  END LOOP;

  SELECT id INTO v_timesheet_id
  FROM public.timesheets
  WHERE assignment_id = v_assignment.id
    AND employee_id = v_assignment.employee_id
    AND week_start_date = p_week_start
    AND week_end_date = p_week_end
    AND status = 'DRAFT'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_timesheet_id IS NULL THEN
    INSERT INTO public.timesheets (
      employee_id, customer_id, job_site_id, assignment_id,
      week_start_date, week_end_date, total_hours, notes, status
    ) VALUES (
      v_assignment.employee_id, v_assignment.customer_id, v_assignment.job_site_id,
      v_assignment.id, p_week_start, p_week_end, v_total,
      NULLIF(TRIM(COALESCE(p_notes, '')), ''), 'DRAFT'
    ) RETURNING id INTO v_timesheet_id;
  ELSE
    UPDATE public.timesheets
    SET total_hours = v_total,
        notes = NULLIF(TRIM(COALESCE(p_notes, '')), ''),
        updated_at = now()
    WHERE id = v_timesheet_id;
    DELETE FROM public.timesheet_entries WHERE timesheet_id = v_timesheet_id;
  END IF;

  INSERT INTO public.timesheet_entries (
    timesheet_id, work_date, start_time, end_time, break_minutes,
    hours, attendance_log_id, notes
  )
  SELECT
    v_timesheet_id,
    (entry->>'workDate')::date,
    COALESCE(NULLIF(entry->>'startTime', ''), 'Manual'),
    COALESCE(NULLIF(entry->>'endTime', ''), 'Manual'),
    0,
    ROUND((entry->>'hours')::numeric, 2),
    NULLIF(entry->>'attendanceLogId', '')::uuid,
    CASE WHEN NULLIF(entry->>'attendanceLogId', '') IS NULL
      THEN 'Manual entry' ELSE 'Imported from recorded attendance' END
  FROM jsonb_array_elements(p_entries) AS entry
  WHERE (entry->>'hours')::numeric > 0;

  RETURN v_timesheet_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_manual_timesheet(uuid, date, date, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_my_manual_timesheet(uuid, date, date, jsonb, text) TO authenticated;

-- Repair previously saved entries only when their recorded times identify one
-- unambiguous, currently unlinked attendance record.
WITH attendance_matches AS (
  SELECT
    te.id AS entry_id,
    (array_agg(a.id))[1] AS attendance_id
  FROM public.timesheet_entries te
  JOIN public.timesheets t ON t.id = te.timesheet_id
  JOIN public.attendance_logs a
    ON a.assignment_id = t.assignment_id
   AND a.employee_id = t.employee_id
   AND a.customer_id = t.customer_id
   AND a.job_site_id = t.job_site_id
   AND (a.clock_in_time AT TIME ZONE 'America/New_York')::date = te.work_date
   AND to_char(a.clock_in_time AT TIME ZONE 'America/New_York', 'HH24:MI') = te.start_time
   AND to_char(a.clock_out_time AT TIME ZONE 'America/New_York', 'HH24:MI') = te.end_time
  WHERE te.attendance_log_id IS NULL
    AND a.clock_out_time IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.timesheet_entries linked
      WHERE linked.attendance_log_id = a.id
    )
  GROUP BY te.id
  HAVING count(*) = 1
)
UPDATE public.timesheet_entries te
SET attendance_log_id = matches.attendance_id,
    notes = 'Imported from recorded attendance',
    updated_at = now()
FROM attendance_matches matches
WHERE te.id = matches.entry_id;
