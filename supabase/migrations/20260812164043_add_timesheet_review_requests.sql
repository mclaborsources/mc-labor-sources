alter table public.timesheet_delivery_items
  add column if not exists review_requested_at timestamptz,
  add column if not exists review_comment text;

comment on column public.timesheet_delivery_items.review_requested_at is
  'Time the customer returned this delivered timesheet to the office for review.';
comment on column public.timesheet_delivery_items.review_comment is
  'Optional customer comment explaining the requested review.';

alter table public.timesheet_delivery_items
  add constraint timesheet_delivery_item_one_customer_decision
  check (customer_approved_at is null or review_requested_at is null);
