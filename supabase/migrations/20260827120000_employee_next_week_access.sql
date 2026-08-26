alter table public.employees
  add column if not exists mobile_next_week_enabled boolean not null default false;

comment on column public.employees.mobile_next_week_enabled is
  'Whether the employee can view the next working week in the mobile app';
