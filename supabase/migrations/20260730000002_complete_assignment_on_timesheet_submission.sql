-- Completing a timesheet also completes its exact assignment visit.

CREATE OR REPLACE FUNCTION public.complete_assignment_from_timesheet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_work_date date;
BEGIN
  IF NEW.assignment_id IS NULL
     OR NEW.status NOT IN ('SUBMITTED', 'SIGNED', 'SENT', 'APPROVED')
     OR OLD.status IN ('SUBMITTED', 'SIGNED', 'SENT', 'APPROVED') THEN
    RETURN NEW;
  END IF;

  SELECT MAX(entry.work_date)
  INTO v_last_work_date
  FROM public.timesheet_entries entry
  WHERE entry.timesheet_id = NEW.id;

  UPDATE public.job_assignments assignment
  SET status = 'COMPLETED',
      end_date = COALESCE(assignment.end_date, v_last_work_date, assignment.assigned_date),
      updated_at = now()
  WHERE assignment.id = NEW.assignment_id
    AND assignment.status IN ('PENDING', 'ACCEPTED', 'ACTIVE');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS timesheets_complete_assignment_on_submission
  ON public.timesheets;

CREATE TRIGGER timesheets_complete_assignment_on_submission
AFTER UPDATE OF status
ON public.timesheets
FOR EACH ROW
EXECUTE FUNCTION public.complete_assignment_from_timesheet();

REVOKE ALL ON FUNCTION public.complete_assignment_from_timesheet() FROM PUBLIC;

COMMENT ON FUNCTION public.complete_assignment_from_timesheet() IS
  'Marks the related assignment visit completed when its timesheet is submitted or signed.';
