-- Workers may submit a completed weekly timesheet without a foreman signature
-- when nobody is available on site. It remains SUBMITTED (not SIGNED) so the
-- admin can verify it through the office.

CREATE OR REPLACE FUNCTION public.submit_my_timesheet_without_signature(
  p_timesheet_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timesheet public.timesheets%ROWTYPE;
BEGIN
  IF public.get_my_role() IS DISTINCT FROM 'WORKER' THEN
    RAISE EXCEPTION 'Worker access required';
  END IF;

  SELECT *
  INTO v_timesheet
  FROM public.timesheets
  WHERE id = p_timesheet_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Timesheet not found';
  END IF;

  IF v_timesheet.employee_id IS DISTINCT FROM public.get_my_employee_id() THEN
    RAISE EXCEPTION 'Not authorized to submit this timesheet';
  END IF;

  IF v_timesheet.status IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'Only a draft timesheet can be submitted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.timesheet_signatures signature
    WHERE signature.timesheet_id = p_timesheet_id
  ) THEN
    RAISE EXCEPTION 'This timesheet already has a foreman signature';
  END IF;

  UPDATE public.timesheets
  SET status = 'SUBMITTED',
      updated_at = now()
  WHERE id = p_timesheet_id;

  RETURN p_timesheet_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_my_timesheet_without_signature(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_my_timesheet_without_signature(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_my_timesheet_without_signature(uuid) TO authenticated;
