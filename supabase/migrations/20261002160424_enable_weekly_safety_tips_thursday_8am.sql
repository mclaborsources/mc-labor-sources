alter table public.safety_tip_weekly_schedule
  alter column enabled set default true,
  alter column weekday set default 4,
  alter column send_time set default '08:00';

insert into public.safety_tip_weekly_schedule (id, enabled, weekday, send_time, timezone, updated_at)
values (true, true, 4, '08:00', 'America/New_York', now())
on conflict (id) do update
set enabled = excluded.enabled,
    weekday = excluded.weekday,
    send_time = excluded.send_time,
    timezone = excluded.timezone,
    updated_at = excluded.updated_at;
