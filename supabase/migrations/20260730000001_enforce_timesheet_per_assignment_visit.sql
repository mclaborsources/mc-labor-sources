-- One assignment row represents one work visit/period and owns one weekly
-- timesheet. A return visit must use a new assignment row, even when the
-- employee, customer, job site, and work week are unchanged.

CREATE OR REPLACE FUNCTION public.prevent_duplicate_assignment_timesheet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.assignment_id IS NULL
     OR NEW.week_start_date IS NULL
     OR NEW.week_end_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.timesheets existing
    WHERE existing.assignment_id = NEW.assignment_id
      AND existing.week_start_date = NEW.week_start_date
      AND existing.week_end_date = NEW.week_end_date
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION
      'This assignment already has a timesheet for the selected work week. Create a new assignment for a separate visit.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS timesheets_prevent_duplicate_assignment_visit
  ON public.timesheets;

CREATE TRIGGER timesheets_prevent_duplicate_assignment_visit
BEFORE INSERT OR UPDATE OF assignment_id, week_start_date, week_end_date
ON public.timesheets
FOR EACH ROW
EXECUTE FUNCTION public.prevent_duplicate_assignment_timesheet();

REVOKE ALL ON FUNCTION public.prevent_duplicate_assignment_timesheet() FROM PUBLIC;

COMMENT ON FUNCTION public.prevent_duplicate_assignment_timesheet() IS
  'Enforces one timesheet per assignment visit and work week; return visits require a new assignment.';
