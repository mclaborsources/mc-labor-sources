alter table public.timesheet_delivery_batches
  add column approval_token_hash text,
  add column approval_expires_at timestamptz;

alter table public.timesheet_delivery_items
  add column customer_approved_at timestamptz;

create unique index timesheet_delivery_batches_approval_token_hash_idx
  on public.timesheet_delivery_batches (approval_token_hash)
  where approval_token_hash is not null;

create index timesheet_delivery_items_customer_approval_idx
  on public.timesheet_delivery_items (timesheet_id, customer_approved_at)
  where customer_approved_at is not null;

comment on column public.timesheet_delivery_batches.approval_token_hash is
  'SHA-256 hash of the unguessable customer approval token sent by email.';
comment on column public.timesheet_delivery_batches.approval_expires_at is
  'Time after which the customer approval link is no longer accepted.';
comment on column public.timesheet_delivery_items.customer_approved_at is
  'Time the customer approved this individual timesheet through the batch approval link.';
