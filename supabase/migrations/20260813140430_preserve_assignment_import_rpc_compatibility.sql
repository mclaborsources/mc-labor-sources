-- Preserve compatibility with the currently deployed admin client while it
-- transitions to passing both boundaries of the selected working week.
CREATE OR REPLACE FUNCTION public.complete_all_open_assignments(
  p_week_end date,
  p_confirmation text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.complete_all_open_assignments(
    p_week_end - 6,
    p_week_end,
    p_confirmation
  );
$$;

REVOKE ALL ON FUNCTION public.complete_all_open_assignments(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_all_open_assignments(date, text) TO authenticated;
