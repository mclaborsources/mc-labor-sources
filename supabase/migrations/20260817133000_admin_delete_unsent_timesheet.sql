create table if not exists public.timesheet_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null,
  deleted_by_user_id uuid not null references public.users(id) on delete restrict,
  deleted_at timestamptz not null default now(),
  timesheet_snapshot jsonb not null
);

alter table public.timesheet_deletion_audit enable row level security;

drop policy if exists timesheet_deletion_audit_admin_read on public.timesheet_deletion_audit;
create policy timesheet_deletion_audit_admin_read
  on public.timesheet_deletion_audit for select to authenticated
  using ((select public.is_admin()));

grant select on public.timesheet_deletion_audit to authenticated;

create or replace function public.admin_delete_unsent_timesheet(p_timesheet_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_timesheet public.timesheets%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can delete timesheets';
  end if;

  select * into v_timesheet from public.timesheets where id = p_timesheet_id for update;
  if not found then raise exception 'Timesheet not found'; end if;

  if v_timesheet.status in ('SENT', 'APPROVED') or exists (
    select 1 from public.timesheet_delivery_items where timesheet_id = p_timesheet_id
  ) then
    raise exception 'A timesheet that was sent to a customer cannot be deleted';
  end if;

  insert into public.timesheet_deletion_audit (
    timesheet_id, deleted_by_user_id, timesheet_snapshot
  ) values (
    p_timesheet_id,
    public.get_my_user_id(),
    jsonb_build_object(
      'timesheet', to_jsonb(v_timesheet),
      'entries', coalesce((
        select jsonb_agg(to_jsonb(entry) order by entry.work_date, entry.start_time)
        from public.timesheet_entries entry
        where entry.timesheet_id = p_timesheet_id
      ), '[]'::jsonb),
      'signature', (
        select to_jsonb(signature)
        from public.timesheet_signatures signature
        where signature.timesheet_id = p_timesheet_id
      )
    )
  );

  delete from public.timesheets where id = p_timesheet_id;
  return true;
end;
$$;

revoke all on function public.admin_delete_unsent_timesheet(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_unsent_timesheet(uuid) to authenticated;

comment on function public.admin_delete_unsent_timesheet(uuid) is
  'Deletes an unsent timesheet and its cascading detail records while preserving an administrator/time/snapshot audit record.';
