-- Admin-managed employee setting. Import functions intentionally do not update it.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hide_pay_rate boolean NOT NULL DEFAULT true;

ALTER TABLE public.employees
  ALTER COLUMN hide_pay_rate SET DEFAULT true;

-- Existing employees start hidden. Admins can explicitly remove individuals from the list.
UPDATE public.employees
SET hide_pay_rate = true;

COMMENT ON COLUMN public.employees.hide_pay_rate IS
  'When true, employee pay rate is suppressed throughout application displays.';
