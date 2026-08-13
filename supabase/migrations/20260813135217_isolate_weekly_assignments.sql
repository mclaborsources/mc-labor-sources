-- Keep every assignment inside the Saturday-Friday working week in which it starts.
-- Also repair historical rows that were accidentally extended into the following week.

UPDATE public.job_assignments
SET
  end_date = assigned_date + ((5 - extract(isodow FROM assigned_date)::integer + 7) % 7),
  updated_at = now()
WHERE end_date > assigned_date + ((5 - extract(isodow FROM assigned_date)::integer + 7) % 7);

ALTER TABLE public.job_assignments
  ADD CONSTRAINT job_assignments_end_within_working_week
  CHECK (
    end_date IS NULL
    OR end_date <= assigned_date + ((5 - extract(isodow FROM assigned_date)::integer + 7) % 7)
  );

DROP FUNCTION IF EXISTS public.complete_all_open_assignments(date, text);

CREATE OR REPLACE FUNCTION public.complete_all_open_assignments(
  p_week_start date,
  p_week_end date,
  p_confirmation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_week_start IS NULL OR p_week_end IS NULL OR p_week_end <> p_week_start + 6 THEN
    RAISE EXCEPTION 'A valid Saturday-Friday working week is required';
  END IF;

  IF extract(isodow FROM p_week_start) <> 6 OR extract(isodow FROM p_week_end) <> 5 THEN
    RAISE EXCEPTION 'Assignment import week must run from Saturday through Friday';
  END IF;

  IF trim(coalesce(p_confirmation, '')) <> 'END-OPEN-ASSIGNMENTS' THEN
    RAISE EXCEPTION 'Invalid confirmation phrase';
  END IF;

  WITH updated AS (
    UPDATE public.job_assignments
    SET
      status = 'COMPLETED',
      end_date = LEAST(
        coalesce(end_date, p_week_start - 1),
        p_week_start - 1,
        assigned_date + ((5 - extract(isodow FROM assigned_date)::integer + 7) % 7)
      ),
      updated_at = now()
    WHERE status IN ('PENDING', 'ACCEPTED', 'ACTIVE')
      AND assigned_date < p_week_start
    RETURNING 1
  )
  SELECT count(*)::int INTO v_completed FROM updated;

  RETURN jsonb_build_object(
    'completed', true,
    'count', v_completed,
    'weekStart', p_week_start,
    'weekEnd', p_week_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_all_open_assignments(date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_all_open_assignments(date, date, text) TO authenticated;
