alter table public.company_settings
  add column if not exists individual_timesheet_emails_enabled boolean not null default false;

comment on column public.company_settings.individual_timesheet_emails_enabled is
  'When enabled, each customer timesheet is delivered in a separate email with its own secure approval link.';
