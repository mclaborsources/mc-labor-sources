-- Trigger-only function: it must not be callable through the Data API.
REVOKE ALL ON FUNCTION public.assignment_job_order_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assignment_job_order_trigger() FROM anon;
REVOKE ALL ON FUNCTION public.assignment_job_order_trigger() FROM authenticated;
