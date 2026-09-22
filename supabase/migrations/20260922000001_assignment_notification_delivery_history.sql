create table public.assignment_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null,
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text not null,
  sent_by_user_id uuid references public.users(id) on delete set null,
  title text not null,
  message text not null,
  sent_at timestamptz not null default now()
);

create index assignment_notification_deliveries_sent_at_idx
  on public.assignment_notification_deliveries (sent_at desc);

alter table public.assignment_notification_deliveries enable row level security;
revoke all on public.assignment_notification_deliveries from anon, authenticated;
grant select on public.assignment_notification_deliveries to authenticated;
create policy assignment_notification_deliveries_admin_read
  on public.assignment_notification_deliveries for select to authenticated
  using (public.is_admin());
