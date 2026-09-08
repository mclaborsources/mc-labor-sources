create table public.notification_scripts (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null check (length(trim(name)) > 0),
  title varchar(100) not null check (length(trim(title)) > 0),
  message varchar(500) not null check (length(trim(message)) > 0),
  created_at timestamptz not null default now()
);
alter table public.notification_scripts enable row level security;
create policy notification_scripts_admin_read on public.notification_scripts for select to authenticated using (public.is_admin());
create policy notification_scripts_admin_insert on public.notification_scripts for insert to authenticated with check (public.is_admin());
grant select, insert on public.notification_scripts to authenticated;
