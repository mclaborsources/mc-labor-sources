create or replace function public.submit_my_signed_timesheets(
  p_timesheet_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_requested_count integer;
  v_eligible_count integer;
  v_updated_count integer;
begin
  if public.get_my_role() is distinct from 'WORKER' then
    raise exception 'Worker access required';
  end if;

  v_employee_id := public.get_my_employee_id();
  if v_employee_id is null then
    raise exception 'Employee profile required';
  end if;

  select count(distinct id)::integer
  into v_requested_count
  from unnest(coalesce(p_timesheet_ids, array[]::uuid[])) as requested(id);

  if v_requested_count = 0 then
    raise exception 'Select at least one signed timesheet';
  end if;
  if v_requested_count > 50 then
    raise exception 'A maximum of 50 timesheets can be submitted at once';
  end if;

  select count(*)::integer
  into v_eligible_count
  from public.timesheets timesheet
  where timesheet.id = any(p_timesheet_ids)
    and timesheet.employee_id = v_employee_id
    and timesheet.status = 'SIGNED'
    and exists (
      select 1
      from public.timesheet_signatures signature
      where signature.timesheet_id = timesheet.id
        and nullif(trim(signature.signature_image_url), '') is not null
    );

  if v_eligible_count <> v_requested_count then
    raise exception 'Every selected timesheet must belong to you and contain a foreman signature';
  end if;

  update public.timesheets timesheet
  set status = 'SUBMITTED',
      updated_at = now()
  where timesheet.id = any(p_timesheet_ids)
    and timesheet.employee_id = v_employee_id
    and timesheet.status = 'SIGNED';

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.submit_my_signed_timesheets(uuid[]) from public;
revoke all on function public.submit_my_signed_timesheets(uuid[]) from anon;
grant execute on function public.submit_my_signed_timesheets(uuid[]) to authenticated;
