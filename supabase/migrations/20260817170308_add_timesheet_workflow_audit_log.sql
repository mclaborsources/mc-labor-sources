create table if not exists public.timesheet_workflow_audit (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  timesheet_id uuid,
  employee_id uuid references public.employees(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  job_site_id uuid references public.job_sites(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in (
    'TIMESHEET_APPROVED',
    'TIMESHEET_APPROVAL_REMOVED',
    'BULK_SEND_MARKED',
    'BULK_SEND_UNMARKED',
    'TIMESHEET_SENT'
  )),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists timesheet_workflow_audit_occurred_idx
  on public.timesheet_workflow_audit (occurred_at desc);
create index if not exists timesheet_workflow_audit_timesheet_idx
  on public.timesheet_workflow_audit (timesheet_id, occurred_at desc);
create index if not exists timesheet_workflow_audit_customer_idx
  on public.timesheet_workflow_audit (customer_id, occurred_at desc);

alter table public.timesheet_workflow_audit enable row level security;

drop policy if exists timesheet_workflow_audit_admin_read on public.timesheet_workflow_audit;
create policy timesheet_workflow_audit_admin_read
  on public.timesheet_workflow_audit for select to authenticated
  using ((select public.is_admin()));

revoke all on table public.timesheet_workflow_audit from public, anon, authenticated;
grant select on table public.timesheet_workflow_audit to authenticated;

create or replace function public.audit_timesheet_workflow_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if new.ready_to_send is distinct from old.ready_to_send then
    insert into public.timesheet_workflow_audit (
      event_key, timesheet_id, employee_id, customer_id, job_site_id,
      actor_user_id, event_type, occurred_at, metadata
    ) values (
      'approval:' || new.id::text || ':' || extract(epoch from v_now)::text,
      new.id, new.employee_id, new.customer_id, new.job_site_id,
      coalesce(new.ready_to_send_by_user_id, public.get_my_user_id()),
      case when new.ready_to_send then 'TIMESHEET_APPROVED' else 'TIMESHEET_APPROVAL_REMOVED' end,
      coalesce(new.ready_to_send_at, v_now),
      jsonb_build_object('status', new.status)
    );
  end if;

  if new.bulk_send_marked is distinct from old.bulk_send_marked then
    insert into public.timesheet_workflow_audit (
      event_key, timesheet_id, employee_id, customer_id, job_site_id,
      actor_user_id, event_type, occurred_at, metadata
    ) values (
      'bulk:' || new.id::text || ':' || extract(epoch from v_now)::text,
      new.id, new.employee_id, new.customer_id, new.job_site_id,
      coalesce(new.bulk_send_marked_by_user_id, public.get_my_user_id()),
      case when new.bulk_send_marked then 'BULK_SEND_MARKED' else 'BULK_SEND_UNMARKED' end,
      coalesce(new.bulk_send_marked_at, v_now),
      jsonb_build_object('status', new.status)
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_timesheet_workflow_changes()
  from public, anon, authenticated;

drop trigger if exists audit_timesheet_workflow_changes on public.timesheets;
create trigger audit_timesheet_workflow_changes
after update of ready_to_send, bulk_send_marked on public.timesheets
for each row execute function public.audit_timesheet_workflow_changes();

create or replace function public.audit_timesheet_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timesheet public.timesheets%rowtype;
  v_batch public.timesheet_delivery_batches%rowtype;
begin
  select * into v_timesheet from public.timesheets where id = new.timesheet_id;
  select * into v_batch from public.timesheet_delivery_batches where id = new.batch_id;

  insert into public.timesheet_workflow_audit (
    event_key, timesheet_id, employee_id, customer_id, job_site_id,
    actor_user_id, event_type, occurred_at, metadata
  ) values (
    'delivery:' || new.batch_id::text || ':' || new.timesheet_id::text,
    v_timesheet.id, v_timesheet.employee_id, v_timesheet.customer_id, v_timesheet.job_site_id,
    v_batch.sent_by_user_id, 'TIMESHEET_SENT', v_batch.sent_at,
    jsonb_build_object(
      'batch_id', v_batch.id,
      'delivery_mode', v_batch.delivery_mode,
      'recipient_email', v_batch.recipient_email
    )
  ) on conflict (event_key) do nothing;

  return new;
end;
$$;

revoke all on function public.audit_timesheet_delivery()
  from public, anon, authenticated;

drop trigger if exists audit_timesheet_delivery on public.timesheet_delivery_items;
create trigger audit_timesheet_delivery
after insert on public.timesheet_delivery_items
for each row execute function public.audit_timesheet_delivery();

insert into public.timesheet_workflow_audit (
  event_key, timesheet_id, employee_id, customer_id, job_site_id,
  actor_user_id, event_type, occurred_at, metadata
)
select
  'approval-backfill:' || t.id::text,
  t.id, t.employee_id, t.customer_id, t.job_site_id,
  t.ready_to_send_by_user_id, 'TIMESHEET_APPROVED', t.ready_to_send_at,
  jsonb_build_object('status', t.status, 'backfilled', true)
from public.timesheets t
where t.ready_to_send and t.ready_to_send_at is not null
on conflict (event_key) do nothing;

insert into public.timesheet_workflow_audit (
  event_key, timesheet_id, employee_id, customer_id, job_site_id,
  actor_user_id, event_type, occurred_at, metadata
)
select
  'bulk-backfill:' || t.id::text,
  t.id, t.employee_id, t.customer_id, t.job_site_id,
  t.bulk_send_marked_by_user_id, 'BULK_SEND_MARKED', t.bulk_send_marked_at,
  jsonb_build_object('status', t.status, 'backfilled', true)
from public.timesheets t
where t.bulk_send_marked and t.bulk_send_marked_at is not null
on conflict (event_key) do nothing;

insert into public.timesheet_workflow_audit (
  event_key, timesheet_id, employee_id, customer_id, job_site_id,
  actor_user_id, event_type, occurred_at, metadata
)
select
  'delivery:' || di.batch_id::text || ':' || di.timesheet_id::text,
  t.id, t.employee_id, t.customer_id, t.job_site_id,
  b.sent_by_user_id, 'TIMESHEET_SENT', b.sent_at,
  jsonb_build_object(
    'batch_id', b.id,
    'delivery_mode', b.delivery_mode,
    'recipient_email', b.recipient_email,
    'backfilled', true
  )
from public.timesheet_delivery_items di
join public.timesheets t on t.id = di.timesheet_id
join public.timesheet_delivery_batches b on b.id = di.batch_id
on conflict (event_key) do nothing;

comment on table public.timesheet_workflow_audit is
  'Append-only administrator-visible audit log for timesheet approval, bulk preparation, and customer delivery.';
