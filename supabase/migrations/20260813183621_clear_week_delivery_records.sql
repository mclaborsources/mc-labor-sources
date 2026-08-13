-- Delete customer-delivery audit rows before their week-scoped timesheets.
-- A batch may contain timesheets from more than one week, so retain the batch
-- whenever it still has at least one delivery item after the selected week is cleared.
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
  v_delivery_items int := 0;
  v_delivery_batches int := 0;
  v_attendance int := 0;
  v_timesheets int := 0;
  v_assignments int := 0;
  v_import_runs int := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_week_end IS NULL OR extract(isodow FROM p_week_end) <> 5 THEN
    RAISE EXCEPTION 'Week ending date must be a Friday';
  END IF;
  IF trim(coalesce(p_confirmation, '')) <> '3360' THEN
    RAISE EXCEPTION 'Invalid deletion code';
  END IF;

  v_week_start := p_week_end - 6;

  WITH deleted AS (
    DELETE FROM public.timesheet_delivery_items AS delivery_item
    USING public.timesheets AS timesheet
    WHERE delivery_item.timesheet_id = timesheet.id
      AND (
        timesheet.work_date BETWEEN v_week_start AND p_week_end
        OR (
          timesheet.week_start_date <= p_week_end
          AND timesheet.week_end_date >= v_week_start
        )
      )
    RETURNING delivery_item.batch_id
  )
  SELECT count(*)::int INTO v_delivery_items FROM deleted;

  WITH deleted AS (
    DELETE FROM public.timesheet_delivery_batches AS batch
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.timesheet_delivery_items AS delivery_item
      WHERE delivery_item.batch_id = batch.id
    )
    RETURNING 1
  )
  SELECT count(*)::int INTO v_delivery_batches FROM deleted;

  WITH deleted AS (
    DELETE FROM public.timesheets
    WHERE work_date BETWEEN v_week_start AND p_week_end
       OR (week_start_date <= p_week_end AND week_end_date >= v_week_start)
    RETURNING 1
  )
  SELECT count(*)::int INTO v_timesheets FROM deleted;

  WITH deleted AS (
    DELETE FROM public.attendance_logs
    WHERE (clock_in_time AT TIME ZONE 'UTC')::date BETWEEN v_week_start AND p_week_end
    RETURNING 1
  )
  SELECT count(*)::int INTO v_attendance FROM deleted;

  WITH deleted AS (
    DELETE FROM public.job_assignments
    WHERE assigned_date BETWEEN v_week_start AND p_week_end
    RETURNING 1
  )
  SELECT count(*)::int INTO v_assignments FROM deleted;

  WITH deleted AS (
    DELETE FROM public.data_import_runs
    WHERE week_start_date = v_week_start AND week_end_date = p_week_end
    RETURNING 1
  )
  SELECT count(*)::int INTO v_import_runs FROM deleted;

  RETURN jsonb_build_object(
    'cleared', true,
    'weekStart', v_week_start,
    'weekEnd', p_week_end,
    'counts', jsonb_build_object(
      'deliveryItems', v_delivery_items,
      'deliveryBatches', v_delivery_batches,
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
