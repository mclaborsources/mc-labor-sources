alter table public.timesheet_delivery_batches
  add column if not exists request_number integer not null default 1,
  add column if not exists original_batch_id uuid references public.timesheet_delivery_batches(id) on delete set null;

alter table public.timesheet_delivery_batches
  drop constraint if exists timesheet_delivery_batches_request_number_check;

alter table public.timesheet_delivery_batches
  add constraint timesheet_delivery_batches_request_number_check
  check (request_number between 1 and 4);

create index if not exists timesheet_delivery_batches_original_request_idx
  on public.timesheet_delivery_batches (original_batch_id, request_number, sent_at desc);

comment on column public.timesheet_delivery_batches.request_number is
  'Verification request sequence: 1 is the original delivery and 2 through 4 are reminders.';
comment on column public.timesheet_delivery_batches.original_batch_id is
  'Original delivery batch that started the verification request sequence; null on original deliveries.';
