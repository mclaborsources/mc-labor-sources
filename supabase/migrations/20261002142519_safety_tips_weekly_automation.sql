create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create table public.safety_tip_weekly_schedule (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  weekday smallint not null default 1 check (weekday between 1 and 7),
  send_time time not null default '09:00',
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now()
);

insert into public.safety_tip_weekly_schedule (id) values (true)
on conflict (id) do nothing;

alter table public.safety_tip_weekly_schedule enable row level security;
create policy safety_tip_weekly_schedule_admin_read on public.safety_tip_weekly_schedule
  for select to authenticated using (public.is_admin());
create policy safety_tip_weekly_schedule_admin_update on public.safety_tip_weekly_schedule
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, update on public.safety_tip_weekly_schedule to authenticated;

create table public.safety_tip_weekly_runs (
  id uuid primary key default gen_random_uuid(),
  iso_year integer not null,
  iso_week smallint not null check (iso_week between 1 and 53),
  tip_number smallint not null check (tip_number between 1 and 52),
  bulletin_id uuid references public.safety_bulletins(id) on delete set null,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'SENT', 'PARTIAL', 'FAILED')),
  recipients_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  unique (iso_year, iso_week)
);

create table public.safety_tip_weekly_deliveries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.safety_tip_weekly_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  recipient_email text not null,
  email_sent_at timestamptz,
  notification_id uuid references public.notifications(id) on delete set null,
  last_error text,
  attempted_at timestamptz,
  unique (run_id, employee_id)
);

alter table public.safety_tip_weekly_runs enable row level security;
alter table public.safety_tip_weekly_deliveries enable row level security;
create policy safety_tip_weekly_runs_admin_read on public.safety_tip_weekly_runs
  for select to authenticated using (public.is_admin());
grant select on public.safety_tip_weekly_runs to authenticated;

create index safety_tip_weekly_deliveries_run_idx on public.safety_tip_weekly_deliveries(run_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.invoke_weekly_safety_tip_sender()
returns void
language plpgsql
security definer
set search_path = pg_catalog, vault, net
as $$
declare
  v_project_url text;
  v_service_role_key text;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets where name = 'service_role_key' limit 1;

  -- Keep the cron job dormant until the two project secrets are configured.
  if coalesce(v_project_url, '') = '' or coalesce(v_service_role_key, '') = '' then
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/send-weekly-safety-tip',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_service_role_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function private.invoke_weekly_safety_tip_sender() from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'send-weekly-safety-tip' limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
  perform cron.schedule(
    'send-weekly-safety-tip',
    '*/5 * * * *',
    'select private.invoke_weekly_safety_tip_sender()'
  );
end;
$$;
