alter table public.employees
  add column if not exists mobile_safety_bulletins_enabled boolean not null default true;

alter table public.employees
  alter column mobile_messages_enabled set default true;

update public.employees
set mobile_messages_enabled = true;

update public.employees
set mobile_safety_bulletins_enabled = true;

comment on column public.employees.mobile_safety_bulletins_enabled is
  'Controls whether the employee can access the Safety Bulletins tab in the mobile app.';
