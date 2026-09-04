alter table public.employees
  add column if not exists mobile_next_week_override boolean,
  add column if not exists mobile_next_week_override_week date;

create or replace function public.set_employee_next_week_override(p_employee uuid, p_enabled boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_week date := (now() at time zone 'America/New_York')::date
  - ((extract(dow from now() at time zone 'America/New_York')::int + 1) % 7);
begin
  if not exists (
    select 1 from public.users
    where auth_user_id = auth.uid() and status = 'ACTIVE'
      and role::text in ('ADMIN','SUPER_ADMIN')
  ) then raise exception 'Admin access required' using errcode = '42501'; end if;
  update public.employees set
    mobile_next_week_override = p_enabled,
    mobile_next_week_override_week = v_week,
    updated_at = now()
  where id = p_employee;
  if not found then raise exception 'Employee not found'; end if;
end;
$$;
revoke all on function public.set_employee_next_week_override(uuid,boolean) from public, anon;
grant execute on function public.set_employee_next_week_override(uuid,boolean) to authenticated;

create or replace function private.employee_week_preview(p_employee uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user public.users%rowtype;
  v_employee uuid;
  v_week date := private.preview_week_start(now());
  v_automatic boolean := false;
  v_override boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_user from public.users where auth_user_id = auth.uid() and status = 'ACTIVE' limit 1;
  if v_user.id is null then raise exception 'Active account required' using errcode = '42501'; end if;
  v_employee := coalesce(p_employee, v_user.employee_id);
  if v_employee is distinct from v_user.employee_id and v_user.role::text not in ('ADMIN','SUPER_ADMIN') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select
    e.status = 'ACTIVE' and e.mobile_assignments_enabled is not false
      and private.highlighted_for_week(e.id, v_week),
    case when e.mobile_next_week_override_week = v_week then e.mobile_next_week_override end
  into v_automatic, v_override
  from public.employees e where e.id = v_employee;
  return jsonb_build_object(
    'nextWeekEnabled', coalesce(v_override, v_automatic, false),
    'automaticNextWeekEnabled', coalesce(v_automatic, false),
    'manualOverride', v_override,
    'currentWeekStart', v_week, 'previewWeekStart', v_week + 7,
    'expiresAt', (v_week + 7)::timestamp at time zone 'America/New_York',
    'serverNow', now(), 'timezone', 'America/New_York'
  );
end;
$$;

comment on function public.set_employee_next_week_override(uuid,boolean) is
  'Admin-only manual next-week access choice for the current Saturday-Friday work week; expires automatically at rollover.';
notify pgrst, 'reload schema';
