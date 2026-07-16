-- Clear operational/import data for one Sat-Fri working week without removing
-- shared employees, customers, job sites, or portal accounts.

CREATE OR REPLACE FUNCTION public.clear_import_week(
  p_week_end date,
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start date;
  v_expected_confirmation text;
  v_attendance int := 0;
  v_timesheets int := 0;
  v_assignments int := 0;
  v_import_runs int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_week_end IS NULL OR extract(isodow FROM p_week_end) <> 5 THEN
    RAISE EXCEPTION 'Week ending date must be a Friday';
  END IF;

  v_week_start := p_week_end - 6;
  v_expected_confirmation := 'CLEAR-WEEK-' || p_week_end::text;

  IF trim(coalesce(p_confirmation, '')) <> v_expected_confirmation THEN
    RAISE EXCEPTION 'Invalid confirmation phrase';
  END IF;

  WITH deleted AS (
    DELETE FROM timesheets
    WHERE (work_date BETWEEN v_week_start AND p_week_end)
       OR (week_start_date <= p_week_end AND week_end_date >= v_week_start)
    RETURNING 1
  )
  SELECT count(*)::int INTO v_timesheets FROM deleted;

  WITH deleted AS (
    DELETE FROM attendance_logs
    WHERE (clock_in_time AT TIME ZONE 'UTC')::date BETWEEN v_week_start AND p_week_end
    RETURNING 1
  )
  SELECT count(*)::int INTO v_attendance FROM deleted;

  WITH deleted AS (
    DELETE FROM job_assignments
    WHERE assigned_date BETWEEN v_week_start AND p_week_end
    RETURNING 1
  )
  SELECT count(*)::int INTO v_assignments FROM deleted;

  WITH deleted AS (
    DELETE FROM data_import_runs
    WHERE week_start_date = v_week_start
      AND week_end_date = p_week_end
    RETURNING 1
  )
  SELECT count(*)::int INTO v_import_runs FROM deleted;

  RETURN jsonb_build_object(
    'cleared', true,
    'weekStart', v_week_start,
    'weekEnd', p_week_end,
    'counts', jsonb_build_object(
      'attendanceLogs', v_attendance,
      'timesheets', v_timesheets,
      'assignments', v_assignments,
      'importRuns', v_import_runs
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_import_week(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_import_week(date, text) TO authenticated;
