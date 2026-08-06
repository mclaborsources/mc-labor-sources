alter table public.employees
  add column if not exists mobile_previous_week_enabled boolean not null default false;

comment on column public.employees.mobile_previous_week_enabled is
  'Controls whether this worker can view assignments from the previous work week.';
