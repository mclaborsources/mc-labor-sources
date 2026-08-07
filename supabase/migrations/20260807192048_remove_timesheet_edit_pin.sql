CREATE OR REPLACE FUNCTION public.admin_update_timesheet_hours(
  p_timesheet_id uuid,
  p_entries jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  PERFORM public.admin_update_timesheet_hours(p_timesheet_id, '3360', p_entries);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_timesheet_hours(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_timesheet_hours(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_timesheet_hours(uuid, jsonb) TO authenticated;
