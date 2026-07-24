CREATE OR REPLACE FUNCTION public.admin_update_timesheet_hours(
  p_timesheet_id uuid,
  p_pin text,
  p_entries jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry jsonb;
  v_entry_id uuid;
  v_hours numeric;
  v_total numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  IF p_pin IS DISTINCT FROM '3360' THEN
    RAISE EXCEPTION 'Incorrect edit PIN' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Timesheet entries must be an array' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.timesheets
    WHERE id = p_timesheet_id
  ) THEN
    RAISE EXCEPTION 'Timesheet not found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    v_entry_id := (v_entry ->> 'id')::uuid;
    v_hours := (v_entry ->> 'hours')::numeric;

    IF v_hours < 0 OR v_hours > 24 OR mod(v_hours, 0.25) <> 0 THEN
      RAISE EXCEPTION 'Hours must be between 0 and 24 in quarter-hour increments'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.timesheet_entries
    SET hours = v_hours
    WHERE id = v_entry_id
      AND timesheet_id = p_timesheet_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Timesheet entry not found' USING ERRCODE = 'P0002';
    END IF;
  END LOOP;

  SELECT COALESCE(sum(hours), 0)
  INTO v_total
  FROM public.timesheet_entries
  WHERE timesheet_id = p_timesheet_id;

  UPDATE public.timesheets
  SET total_hours = v_total,
      updated_at = now()
  WHERE id = p_timesheet_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_timesheet_hours(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_timesheet_hours(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_timesheet_hours(uuid, text, jsonb) TO authenticated;
