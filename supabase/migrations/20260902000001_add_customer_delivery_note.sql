alter table public.timesheet_delivery_batches
  add column if not exists customer_note text;

comment on column public.timesheet_delivery_batches.customer_note is
  'Optional batch-level note submitted by the customer from the timesheet review page.';

alter table public.timesheet_delivery_batches
  drop constraint if exists timesheet_delivery_batches_customer_note_length;

alter table public.timesheet_delivery_batches
  add constraint timesheet_delivery_batches_customer_note_length
  check (customer_note is null or char_length(customer_note) <= 2000);
