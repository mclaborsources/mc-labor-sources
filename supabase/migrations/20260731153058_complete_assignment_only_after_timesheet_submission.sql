-- A foreman signature only locks the timesheet for later submission.
-- Complete the related assignment only when the employee submits it (or when
-- it reaches a later delivery/approval status through an administrative flow).

create or replace function public.complete_assignment_from_timesheet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_work_date date;
begin
  if new.assignment_id is null
     or new.status not in ('SUBMITTED', 'SENT', 'APPROVED')
     or old.status in ('SUBMITTED', 'SENT', 'APPROVED') then
    return new;
  end if;

  select max(entry.work_date)
  into v_last_work_date
  from public.timesheet_entries entry
  where entry.timesheet_id = new.id;

  update public.job_assignments assignment
  set status = 'COMPLETED',
      end_date = coalesce(assignment.end_date, v_last_work_date, assignment.assigned_date),
      updated_at = now()
  where assignment.id = new.assignment_id
    and assignment.status in ('PENDING', 'ACCEPTED', 'ACTIVE');

  return new;
end;
$$;

revoke all on function public.complete_assignment_from_timesheet() from public;
revoke all on function public.complete_assignment_from_timesheet() from anon;
revoke all on function public.complete_assignment_from_timesheet() from authenticated;

comment on function public.complete_assignment_from_timesheet() is
  'Marks the related assignment completed only after its timesheet is submitted, sent, or approved; signing alone leaves the assignment open.';
