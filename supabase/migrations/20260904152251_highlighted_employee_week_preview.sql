-- Deployed migration version aligned with production migration history.
-- Deploy before the updated admin/mobile apps. No cron or sticky permission:
-- eligibility is recalculated for the office's current Saturday-Friday week.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.preview_week_start(p_at timestamptz)
returns date language sql immutable set search_path = '' as $$
  select (p_at at time zone 'America/New_York')::date
    - ((extract(dow from p_at at time zone 'America/New_York')::int + 1) % 7);
$$;

-- Owner-only helper: bypasses assignment RLS to avoid recursive policy checks.
-- Exactly matches the admin highlight rule, including null end = single day.
create or replace function private.highlighted_for_week(p_employee uuid, p_week date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.job_assignments a
    where a.employee_id = p_employee
      and a.assigned_date <= p_week + 6
      and coalesce(a.end_date, a.assigned_date) >= p_week
      and not exists (
        select 1 from public.job_assignments prior
        where prior.employee_id = a.employee_id
          and prior.assigned_date <= p_week - 1
          and coalesce(prior.end_date, prior.assigned_date) >= p_week - 7
          and prior.customer_id is not distinct from a.customer_id
          and prior.job_site_id is not distinct from a.job_site_id
      )
  );
$$;
revoke all on function private.preview_week_start(timestamptz) from public, anon, authenticated;
revoke all on function private.highlighted_for_week(uuid,date) from public, anon, authenticated;

-- Only the authenticated employee (or an active office admin) may inspect access.
create or replace function private.employee_week_preview(p_employee uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user public.users%rowtype;
  v_employee uuid;
  v_week date := private.preview_week_start(now());
  v_enabled boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_user from public.users where auth_user_id = auth.uid() and status = 'ACTIVE' limit 1;
  if v_user.id is null then raise exception 'Active account required' using errcode = '42501'; end if;
  v_employee := coalesce(p_employee, v_user.employee_id);
  if v_employee is distinct from v_user.employee_id and v_user.role::text not in ('ADMIN','SUPER_ADMIN') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select exists (
    select 1 from public.employees e where e.id = v_employee and e.status = 'ACTIVE'
      and e.mobile_assignments_enabled is not false
      and private.highlighted_for_week(e.id, v_week)
  ) into v_enabled;
  return jsonb_build_object(
    'nextWeekEnabled', v_enabled, 'currentWeekStart', v_week,
    'previewWeekStart', v_week + 7,
    'expiresAt', (v_week + 7)::timestamp at time zone 'America/New_York',
    'serverNow', now(), 'timezone', 'America/New_York'
  );
end;
$$;
revoke all on function private.employee_week_preview(uuid) from public, anon;
grant execute on function private.employee_week_preview(uuid) to authenticated;

create or replace function public.get_employee_week_preview(p_employee uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.employee_week_preview(p_employee);
$$;
revoke all on function public.get_employee_week_preview(uuid) from public, anon;
grant execute on function public.get_employee_week_preview(uuid) to authenticated;

-- Restrictive so another permissive worker policy cannot bypass the preview limit.
-- Past/current visibility remains unchanged; only future visibility is restricted.
create policy worker_future_assignment_preview on public.job_assignments
as restrictive for select to authenticated using (
  (select public.get_my_role()) <> 'WORKER'
  or (
    employee_id = (select public.get_my_employee_id())
    and assigned_date < ((select private.employee_week_preview(null)->>'previewWeekStart')::date)
  )
  or (
    employee_id = (select public.get_my_employee_id())
    and (select (private.employee_week_preview(null)->>'nextWeekEnabled')::boolean)
    and assigned_date < ((select private.employee_week_preview(null)->>'previewWeekStart')::date) + 7
  )
);
comment on function public.get_employee_week_preview(uuid) is
  'Highlighted employees only: current vs previous week customer/job changes or no previous assignment. Preview expires Saturday 00:00 America/New_York; next week is recalculated, never inherited. Legacy mobile_next_week_enabled is not used.';
-- Job-order details contain the same assignment information: don't allow a
-- direct job-order URL to bypass the assignment preview restriction.
create policy worker_future_job_order_preview on public.job_orders
as restrictive for select to authenticated using (
  (select public.get_my_role()) <> 'WORKER'
  or (
    employee_id = (select public.get_my_employee_id())
    and (assignment_id is null or exists (
      select 1 from public.job_assignments a where a.id = job_orders.assignment_id
    ))
    and (
      start_date < ((select private.employee_week_preview(null)->>'previewWeekStart')::date)
      or (
        (select (private.employee_week_preview(null)->>'nextWeekEnabled')::boolean)
        and start_date < ((select private.employee_week_preview(null)->>'previewWeekStart')::date) + 7
      )
    )
  )
);
notify pgrst, 'reload schema';
