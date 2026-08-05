alter table public.employees
  add column if not exists mobile_assignments_enabled boolean not null default true,
  add column if not exists mobile_clock_enabled boolean not null default true,
  add column if not exists mobile_tasks_enabled boolean not null default true,
  add column if not exists mobile_messages_enabled boolean not null default true,
  add column if not exists mobile_profile_enabled boolean not null default true;

comment on column public.employees.mobile_assignments_enabled is
  'Controls whether this worker can see the Assignments mobile tab.';
comment on column public.employees.mobile_clock_enabled is
  'Controls whether this worker can see the Clock mobile tab.';
comment on column public.employees.mobile_tasks_enabled is
  'Controls whether this worker can see the Tasks mobile tab.';
comment on column public.employees.mobile_messages_enabled is
  'Controls whether this worker can see the Messages mobile tab.';
comment on column public.employees.mobile_profile_enabled is
  'Controls whether this worker can see the Profile mobile tab.';
