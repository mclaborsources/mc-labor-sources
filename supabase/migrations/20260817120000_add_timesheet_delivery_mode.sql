alter table public.timesheet_delivery_batches
  add column if not exists delivery_mode text;

alter table public.timesheet_delivery_batches
  drop constraint if exists timesheet_delivery_batches_delivery_mode_check;

alter table public.timesheet_delivery_batches
  add constraint timesheet_delivery_batches_delivery_mode_check
  check (delivery_mode in ('BULK', 'INDIVIDUAL'));

comment on column public.timesheet_delivery_batches.delivery_mode is
  'Whether the administrator sent the selected timesheets as one bulk email or as individual emails. Null identifies delivery records created before mode tracking.';
