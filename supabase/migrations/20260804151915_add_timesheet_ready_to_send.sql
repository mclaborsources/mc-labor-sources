alter table public.timesheets
  add column if not exists ready_to_send boolean not null default false,
  add column if not exists ready_to_send_at timestamptz,
  add column if not exists ready_to_send_by_user_id uuid references public.users(id) on delete set null;

create index if not exists timesheets_ready_to_send_week_idx
  on public.timesheets (week_start_date, week_end_date, ready_to_send)
  where status = 'SUBMITTED' and not is_training;

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
      new.ready_to_send_by_user_id := auth.uid();
    else
      new.ready_to_send_at := null;
      new.ready_to_send_by_user_id := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.set_timesheet_ready_audit() from public;

drop trigger if exists set_timesheet_ready_audit on public.timesheets;
create trigger set_timesheet_ready_audit
before update of ready_to_send on public.timesheets
for each row execute function public.set_timesheet_ready_audit();
