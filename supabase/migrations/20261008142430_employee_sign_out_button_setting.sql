alter table public.employees
  add column if not exists mobile_sign_out_enabled boolean not null default false;

comment on column public.employees.mobile_sign_out_enabled is
  'Admin-controlled visibility of the worker app Sign Out button; disabled by default.';
