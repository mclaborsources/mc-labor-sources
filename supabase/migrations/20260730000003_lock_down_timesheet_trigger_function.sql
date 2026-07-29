-- Trigger functions are internal database hooks and must not be callable
-- through the Data API by anonymous or authenticated clients.

REVOKE ALL ON FUNCTION public.complete_assignment_from_timesheet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_assignment_from_timesheet() FROM anon;
REVOKE ALL ON FUNCTION public.complete_assignment_from_timesheet() FROM authenticated;

REVOKE ALL ON FUNCTION public.prevent_duplicate_assignment_timesheet() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_duplicate_assignment_timesheet() FROM anon;
REVOKE ALL ON FUNCTION public.prevent_duplicate_assignment_timesheet() FROM authenticated;
