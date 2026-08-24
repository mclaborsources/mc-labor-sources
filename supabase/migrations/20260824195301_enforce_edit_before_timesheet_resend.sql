alter table public.timesheets
  add column if not exists content_edited_at timestamptz;

comment on column public.timesheets.content_edited_at is
  'Last time customer-visible hours or office notes were changed. Used to require a correction after customer rejection before resend.';

create or replace function public.mark_timesheet_content_edited()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.total_hours is distinct from old.total_hours
     or new.notes is distinct from old.notes
     or new.office_notes is distinct from old.office_notes then
    new.content_edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists timesheets_mark_content_edited on public.timesheets;
create trigger timesheets_mark_content_edited
before update of total_hours, notes, office_notes on public.timesheets
for each row execute function public.mark_timesheet_content_edited();

create or replace function public.mark_timesheet_content_edited_from_entry()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_timesheet_id uuid;
begin
  if tg_op = 'DELETE' then
    target_timesheet_id := old.timesheet_id;
  else
    target_timesheet_id := new.timesheet_id;
  end if;
  update public.timesheets
  set content_edited_at = now()
  where id = target_timesheet_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists timesheet_entries_mark_content_edited on public.timesheet_entries;
create trigger timesheet_entries_mark_content_edited
after insert or delete
on public.timesheet_entries
for each row execute function public.mark_timesheet_content_edited_from_entry();

drop trigger if exists timesheet_entries_update_marks_content_edited on public.timesheet_entries;
create trigger timesheet_entries_update_marks_content_edited
after update of work_date, start_time, end_time, break_minutes, hours, notes
on public.timesheet_entries
for each row
when (
  new.work_date is distinct from old.work_date
  or new.start_time is distinct from old.start_time
  or new.end_time is distinct from old.end_time
  or new.break_minutes is distinct from old.break_minutes
  or new.hours is distinct from old.hours
  or new.notes is distinct from old.notes
)
execute function public.mark_timesheet_content_edited_from_entry();
