ALTER TABLE public.timesheets
ADD COLUMN IF NOT EXISTS office_notes text;

COMMENT ON COLUMN public.timesheets.office_notes IS
  'Internal admin-only notes. Not included in employee views or customer deliveries.';
