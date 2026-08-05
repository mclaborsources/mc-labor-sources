create or replace function public.sign_timesheet(
  p_timesheet_id uuid,
  p_foreman_name text,
  p_foreman_email text,
  p_signature_image_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timesheet public.timesheets%rowtype;
begin
  if p_foreman_name is null or trim(p_foreman_name) = '' then
    raise exception 'Foreman name is required';
  end if;

  if p_signature_image_url is null or trim(p_signature_image_url) = '' then
    raise exception 'Signature image URL is required';
  end if;

  select *
  into v_timesheet
  from public.timesheets
  where id = p_timesheet_id;

  if not found then
    raise exception 'Timesheet not found';
  end if;

  if not public.is_supervisor_of_job_site(v_timesheet.job_site_id)
     and v_timesheet.employee_id is distinct from public.get_my_employee_id() then
    raise exception 'Not authorized to sign this timesheet';
  end if;

  if v_timesheet.status not in ('DRAFT', 'SUBMITTED') then
    raise exception 'Timesheet has already been signed';
  end if;

  insert into public.timesheet_signatures (
    timesheet_id,
    foreman_name,
    foreman_email,
    signature_image_url,
    signed_at
  )
  values (
    p_timesheet_id,
    trim(p_foreman_name),
    nullif(trim(coalesce(p_foreman_email, '')), ''),
    trim(p_signature_image_url),
    now()
  );

  update public.timesheets
  set status = 'SUBMITTED',
      updated_at = now()
  where id = p_timesheet_id;

  return p_timesheet_id;
end;
$$;

revoke all on function public.sign_timesheet(uuid, text, text, text) from public;
revoke all on function public.sign_timesheet(uuid, text, text, text) from anon;
grant execute on function public.sign_timesheet(uuid, text, text, text) to authenticated;
