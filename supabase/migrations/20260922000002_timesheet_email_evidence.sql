alter table public.timesheet_delivery_batches
  add column sender_email text,
  add column smtp_message_id text,
  add column sent_text text,
  add column sent_html text,
  add column sent_raw_base64 text;

alter table public.timesheet_delivery_items
  add column last_decision_source_batch_id uuid references public.timesheet_delivery_batches(id) on delete set null;

create table public.timesheet_customer_decision_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  timesheet_id uuid not null,
  customer_id uuid not null,
  source_batch_id uuid references public.timesheet_delivery_batches(id) on delete set null,
  recipient_email text,
  decision text not null check (decision in ('APPROVED', 'CHANGES_REQUESTED')),
  comment text,
  decided_at timestamptz not null
);

create index timesheet_customer_decision_events_customer_idx
  on public.timesheet_customer_decision_events (customer_id, decided_at desc);

create or replace function public.record_timesheet_customer_decision()
returns trigger language plpgsql set search_path = public as $$
declare
  v_customer_id uuid;
  v_decision text;
  v_decided_at timestamptz;
  v_recipient_email text;
begin
  if new.customer_approved_at is distinct from old.customer_approved_at and new.customer_approved_at is not null then
    v_decision := 'APPROVED';
    v_decided_at := new.customer_approved_at;
  elsif new.review_requested_at is distinct from old.review_requested_at and new.review_requested_at is not null then
    v_decision := 'CHANGES_REQUESTED';
    v_decided_at := new.review_requested_at;
  else
    return new;
  end if;

  select customer_id into v_customer_id from public.timesheets where id = new.timesheet_id;
  select recipient_email into v_recipient_email from public.timesheet_delivery_batches
    where id = new.last_decision_source_batch_id;
  insert into public.timesheet_customer_decision_events
    (event_key, timesheet_id, customer_id, source_batch_id, recipient_email, decision, comment, decided_at)
  values
    (new.timesheet_id::text || ':' || v_decision || ':' || v_decided_at::text,
     new.timesheet_id, v_customer_id, new.last_decision_source_batch_id, v_recipient_email, v_decision,
     case when v_decision = 'CHANGES_REQUESTED' then new.review_comment else null end,
     v_decided_at)
  on conflict (event_key) do nothing;
  return new;
end;
$$;

revoke all on function public.record_timesheet_customer_decision() from public, anon, authenticated;
create trigger record_timesheet_customer_decision
after update of customer_approved_at, review_requested_at on public.timesheet_delivery_items
for each row execute function public.record_timesheet_customer_decision();

insert into public.timesheet_customer_decision_events
  (event_key, timesheet_id, customer_id, decision, comment, decided_at)
select distinct on (di.timesheet_id, decision, decided_at)
  di.timesheet_id::text || ':' || decision || ':' || decided_at::text,
  di.timesheet_id, t.customer_id, decision,
  case when decision = 'CHANGES_REQUESTED' then di.review_comment else null end,
  decided_at
from public.timesheet_delivery_items di
join public.timesheets t on t.id = di.timesheet_id
cross join lateral (values
  ('APPROVED', di.customer_approved_at),
  ('CHANGES_REQUESTED', di.review_requested_at)
) as event(decision, decided_at)
where decided_at is not null
on conflict (event_key) do nothing;

create table public.timesheet_email_imports (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.timesheet_delivery_batches(id) on delete cascade,
  filename text not null,
  raw_eml_base64 text not null check (octet_length(raw_eml_base64) <= 13981016),
  imported_by_user_id uuid not null references public.users(id) on delete restrict,
  imported_at timestamptz not null default now()
);

create index timesheet_email_imports_batch_idx on public.timesheet_email_imports (batch_id, imported_at);

alter table public.timesheet_customer_decision_events enable row level security;
alter table public.timesheet_email_imports enable row level security;
revoke all on public.timesheet_customer_decision_events from anon, authenticated;
revoke all on public.timesheet_email_imports from anon, authenticated;
grant select on public.timesheet_customer_decision_events to authenticated;
grant select, insert on public.timesheet_email_imports to authenticated;
create policy timesheet_customer_decision_events_admin_read
  on public.timesheet_customer_decision_events for select to authenticated using (public.is_admin());
create policy timesheet_email_imports_admin_read
  on public.timesheet_email_imports for select to authenticated using (public.is_admin());
create policy timesheet_email_imports_admin_insert
  on public.timesheet_email_imports for insert to authenticated
  with check (public.is_admin() and imported_by_user_id = public.get_my_user_id());
