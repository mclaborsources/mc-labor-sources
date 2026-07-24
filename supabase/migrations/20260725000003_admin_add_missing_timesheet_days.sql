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
  v_work_date date;
  v_hours numeric;
  v_total numeric;
  v_week_start date;
  v_week_end date;
  v_work_date_only date;
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

  SELECT week_start_date, week_end_date, work_date
  INTO v_week_start, v_week_end, v_work_date_only
  FROM public.timesheets
  WHERE id = p_timesheet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_entries)
  LOOP
    v_entry_id := NULLIF(v_entry ->> 'id', '')::uuid;
    v_work_date := (v_entry ->> 'workDate')::date;
    v_hours := (v_entry ->> 'hours')::numeric;

    IF v_hours < 0 OR v_hours > 24 OR mod(v_hours, 0.25) <> 0 THEN
      RAISE EXCEPTION 'Hours must be between 0 and 24 in quarter-hour increments'
        USING ERRCODE = '22023';
    END IF;

    IF v_week_start IS NOT NULL AND v_week_end IS NOT NULL THEN
      IF v_work_date < v_week_start OR v_work_date > v_week_end THEN
        RAISE EXCEPTION 'Entry date is outside the timesheet period' USING ERRCODE = '22023';
      END IF;
    ELSIF v_work_date_only IS NOT NULL AND v_work_date <> v_work_date_only THEN
      RAISE EXCEPTION 'Entry date does not match the timesheet date' USING ERRCODE = '22023';
    END IF;

    IF v_entry_id IS NOT NULL THEN
      UPDATE public.timesheet_entries
      SET hours = v_hours,
          updated_at = now()
      WHERE id = v_entry_id
        AND timesheet_id = p_timesheet_id
        AND work_date = v_work_date;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Timesheet entry not found' USING ERRCODE = 'P0002';
      END IF;
    ELSIF v_hours > 0 THEN
      IF EXISTS (
        SELECT 1
        FROM public.timesheet_entries
        WHERE timesheet_id = p_timesheet_id
          AND work_date = v_work_date
      ) THEN
        UPDATE public.timesheet_entries
        SET hours = v_hours,
            updated_at = now()
        WHERE timesheet_id = p_timesheet_id
          AND work_date = v_work_date;
      ELSE
        INSERT INTO public.timesheet_entries (
          timesheet_id,
          work_date,
          start_time,
          end_time,
          break_minutes,
          hours,
          notes
        )
        VALUES (
          p_timesheet_id,
          v_work_date,
          '',
          '',
          0,
          v_hours,
          'Added by administrator'
        );
      END IF;
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
