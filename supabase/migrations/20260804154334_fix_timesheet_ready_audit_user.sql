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
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.set_timesheet_ready_audit() from public;
