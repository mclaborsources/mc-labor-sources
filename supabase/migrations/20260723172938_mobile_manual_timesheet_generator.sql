-- Worker-generated Saturday-Friday timesheets with recorded and manual hours.
-- The RPC is SECURITY INVOKER so all writes remain constrained by RLS.

DROP POLICY IF EXISTS timesheets_worker_insert ON public.timesheets;
CREATE POLICY timesheets_worker_insert ON public.timesheets
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_my_role() = 'WORKER'
    AND employee_id = public.get_my_employee_id()
    AND status = 'DRAFT'
  );

DROP POLICY IF EXISTS timesheets_worker_update ON public.timesheets;
CREATE POLICY timesheets_worker_update ON public.timesheets
  FOR UPDATE TO authenticated
  USING (
    public.get_my_role() = 'WORKER'
    AND employee_id = public.get_my_employee_id()
    AND status = 'DRAFT'
  )
  WITH CHECK (
    public.get_my_role() = 'WORKER'
    AND employee_id = public.get_my_employee_id()
    AND status = 'DRAFT'
  );

DROP POLICY IF EXISTS timesheet_entries_worker_insert ON public.timesheet_entries;
CREATE POLICY timesheet_entries_worker_insert ON public.timesheet_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.timesheets t
      WHERE t.id = timesheet_entries.timesheet_id
        AND t.employee_id = public.get_my_employee_id()
        AND t.status = 'DRAFT'
    )
  );

DROP POLICY IF EXISTS timesheet_entries_worker_update ON public.timesheet_entries;
CREATE POLICY timesheet_entries_worker_update ON public.timesheet_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.timesheets t
      WHERE t.id = timesheet_entries.timesheet_id
        AND t.employee_id = public.get_my_employee_id()
        AND t.status = 'DRAFT'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.timesheets t
      WHERE t.id = timesheet_entries.timesheet_id
        AND t.employee_id = public.get_my_employee_id()
        AND t.status = 'DRAFT'
    )
  );

DROP POLICY IF EXISTS timesheet_entries_worker_delete ON public.timesheet_entries;
CREATE POLICY timesheet_entries_worker_delete ON public.timesheet_entries
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.timesheets t
      WHERE t.id = timesheet_entries.timesheet_id
        AND t.employee_id = public.get_my_employee_id()
        AND t.status = 'DRAFT'
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.timesheets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timesheet_entries TO authenticated;

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

  SELECT *
  INTO v_assignment
  FROM public.job_assignments
  WHERE id = p_assignment_id
    AND employee_id = public.get_my_employee_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

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
      SELECT 1
      FROM public.attendance_logs a
      WHERE a.id = v_attendance_id
        AND a.employee_id = v_assignment.employee_id
        AND a.customer_id = v_assignment.customer_id
        AND a.job_site_id = v_assignment.job_site_id
        AND a.status = 'CLOCKED_OUT'
        AND (a.clock_in_time AT TIME ZONE 'America/New_York')::date = v_work_date
    ) THEN
      RAISE EXCEPTION 'Recorded attendance does not match this assignment';
    END IF;

    v_total := v_total + v_hours;
  END LOOP;

  SELECT id
  INTO v_timesheet_id
  FROM public.timesheets
  WHERE employee_id = v_assignment.employee_id
    AND customer_id = v_assignment.customer_id
    AND job_site_id = v_assignment.job_site_id
    AND week_start_date = p_week_start
    AND week_end_date = p_week_end
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
      total_hours,
      notes,
      status
    )
    VALUES (
      v_assignment.employee_id,
      v_assignment.customer_id,
      v_assignment.job_site_id,
      v_assignment.id,
      p_week_start,
      p_week_end,
      v_total,
      NULLIF(TRIM(COALESCE(p_notes, '')), ''),
      'DRAFT'
    )
    RETURNING id INTO v_timesheet_id;
  ELSE
    UPDATE public.timesheets
    SET assignment_id = v_assignment.id,
        total_hours = v_total,
        notes = NULLIF(TRIM(COALESCE(p_notes, '')), ''),
        updated_at = now()
    WHERE id = v_timesheet_id;

    DELETE FROM public.timesheet_entries
    WHERE timesheet_id = v_timesheet_id;
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
  SELECT
    v_timesheet_id,
    (entry->>'workDate')::date,
    COALESCE(NULLIF(entry->>'startTime', ''), 'Manual'),
    COALESCE(NULLIF(entry->>'endTime', ''), 'Manual'),
    0,
    ROUND((entry->>'hours')::numeric, 2),
    NULL,
    CASE
      WHEN NULLIF(entry->>'attendanceLogId', '') IS NULL THEN 'Manual entry'
      ELSE 'Imported from recorded attendance'
    END
  FROM jsonb_array_elements(p_entries) AS entry
  WHERE (entry->>'hours')::numeric > 0;

  RETURN v_timesheet_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_manual_timesheet(uuid, date, date, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_my_manual_timesheet(uuid, date, date, jsonb, text) TO authenticated;
