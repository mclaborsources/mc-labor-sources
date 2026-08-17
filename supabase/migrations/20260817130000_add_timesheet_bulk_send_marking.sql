alter table public.timesheets
  add column if not exists bulk_send_marked boolean not null default false,
  add column if not exists bulk_send_marked_at timestamptz,
  add column if not exists bulk_send_marked_by_user_id uuid references public.users(id) on delete set null;

alter table public.timesheets
  drop constraint if exists timesheets_bulk_send_marked_eligible_check;

alter table public.timesheets
  add constraint timesheets_bulk_send_marked_eligible_check
  check (not bulk_send_marked or (status = 'SUBMITTED' and ready_to_send and not is_training));

create index if not exists timesheets_bulk_send_week_idx
  on public.timesheets (week_start_date, week_end_date, bulk_send_marked)
  where bulk_send_marked;

create or replace function public.set_timesheet_bulk_send_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.bulk_send_marked is distinct from old.bulk_send_marked then
    if new.bulk_send_marked then
      if new.status <> 'SUBMITTED' or new.is_training or not new.ready_to_send then
        raise exception 'Only submitted, approved, non-training timesheets can be marked for bulk send';
      end if;
      new.bulk_send_marked_at := now();
      new.bulk_send_marked_by_user_id := public.get_my_user_id();
    else
      new.bulk_send_marked_at := null;
      new.bulk_send_marked_by_user_id := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.set_timesheet_bulk_send_audit() from public;

drop trigger if exists set_timesheet_bulk_send_audit on public.timesheets;
create trigger set_timesheet_bulk_send_audit
before update of bulk_send_marked on public.timesheets
for each row execute function public.set_timesheet_bulk_send_audit();

create or replace function public.set_timesheet_ready_audit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.ready_to_send is distinct from old.ready_to_send then
    if new.ready_to_send then
      if new.status <> 'SUBMITTED' or new.is_training then
        raise exception 'Only submitted, non-training timesheets can be marked ready to send';
      end if;
      new.ready_to_send_at := now();
      new.ready_to_send_by_user_id := public.get_my_user_id();
    else
      new.ready_to_send_at := null;
      new.ready_to_send_by_user_id := null;
      new.bulk_send_marked := false;
      new.bulk_send_marked_at := null;
      new.bulk_send_marked_by_user_id := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.set_timesheet_ready_audit() from public;

create or replace function public.clear_customer_week_bulk_marks_after_delivery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_week_start date;
  v_week_end date;
begin
  select
    customer_id,
    coalesce(week_start_date, work_date),
    coalesce(week_end_date, work_date)
  into v_customer_id, v_week_start, v_week_end
  from public.timesheets
  where id = new.timesheet_id;

  update public.timesheets
  set bulk_send_marked = false,
      bulk_send_marked_at = null,
      bulk_send_marked_by_user_id = null,
      updated_at = now()
  where customer_id = v_customer_id
    and coalesce(week_start_date, work_date) <= v_week_end
    and coalesce(week_end_date, work_date) >= v_week_start
    and bulk_send_marked;

  return new;
end;
$$;

revoke all on function public.clear_customer_week_bulk_marks_after_delivery() from public, anon, authenticated;

drop trigger if exists clear_customer_week_bulk_marks_after_delivery on public.timesheet_delivery_items;
create trigger clear_customer_week_bulk_marks_after_delivery
after insert on public.timesheet_delivery_items
for each row execute function public.clear_customer_week_bulk_marks_after_delivery();

create or replace function public.set_customer_week_timesheets_bulk_marked(
  p_customer_id uuid,
  p_week_start date,
  p_week_end date,
  p_ready boolean
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_updated_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can prepare customer timesheets for bulk send';
  end if;
  if p_week_end < p_week_start then raise exception 'Invalid work week'; end if;

  if p_ready then
    if exists (
      select 1 from public.timesheets t
      where t.customer_id = p_customer_id
        and not t.is_training
        and coalesce(t.week_start_date, t.work_date) <= p_week_end
        and coalesce(t.week_end_date, t.work_date) >= p_week_start
        and (t.status <> 'SUBMITTED' or not t.ready_to_send)
    ) then
      raise exception 'Every timesheet must be submitted and approved before this customer can be marked for bulk send';
    end if;
    if exists (
      select 1 from public.timesheets t
      join public.timesheet_delivery_items di on di.timesheet_id = t.id
      where t.customer_id = p_customer_id
        and not t.is_training
        and coalesce(t.week_start_date, t.work_date) <= p_week_end
        and coalesce(t.week_end_date, t.work_date) >= p_week_start
    ) then
      raise exception 'This customer cannot be marked for bulk send because one or more timesheets were already sent';
    end if;
  end if;

  update public.timesheets t
  set bulk_send_marked = p_ready,
      updated_at = now()
  where t.customer_id = p_customer_id
    and not t.is_training
    and t.status = 'SUBMITTED'
    and coalesce(t.week_start_date, t.work_date) <= p_week_end
    and coalesce(t.week_end_date, t.work_date) >= p_week_start
    and t.bulk_send_marked is distinct from p_ready;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.set_customer_week_timesheets_bulk_marked(uuid, date, date, boolean) from public, anon, authenticated;
grant execute on function public.set_customer_week_timesheets_bulk_marked(uuid, date, date, boolean) to authenticated;

comment on column public.timesheets.bulk_send_marked is
  'Administrator-controlled enrollment in the next bulk customer delivery.';

comment on function public.set_customer_week_timesheets_bulk_marked(uuid, date, date, boolean) is
  'Atomically marks or clears one customer work week for bulk delivery after enforcing approval and prior-delivery rules.';
