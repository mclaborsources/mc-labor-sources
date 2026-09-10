-- A successful clock-in acknowledges only its matching assignment document.
-- Run with the caller's permissions; existing job-order RLS still applies.
CREATE OR REPLACE FUNCTION public.acknowledge_job_order_on_clock_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'CLOCKED_IN' AND NEW.assignment_id IS NOT NULL THEN
    UPDATE public.job_orders
    SET status = 'ACKNOWLEDGED',
        acknowledged_at = coalesce(acknowledged_at, NEW.clock_in_time),
        updated_at = now()
    WHERE assignment_id = NEW.assignment_id
      AND employee_id = NEW.employee_id
      AND customer_id = NEW.customer_id
      AND job_site_id = NEW.job_site_id
      AND status IN ('DRAFT', 'SENT');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_job_order_on_clock_in() FROM PUBLIC;

CREATE TRIGGER acknowledge_job_order_after_clock_in
AFTER INSERT ON public.attendance_logs
FOR EACH ROW EXECUTE FUNCTION public.acknowledge_job_order_on_clock_in();
