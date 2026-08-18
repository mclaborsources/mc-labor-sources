-- Correct the default: only employees explicitly added to the hidden list are suppressed.
ALTER TABLE public.employees
  ALTER COLUMN hide_pay_rate SET DEFAULT false;

-- The previous migration temporarily placed everyone on the hidden list.
-- Clear that blanket state so administrators can build the intended exception list.
UPDATE public.employees
SET hide_pay_rate = false;
