-- Normalize imported project start times and copy them onto every assignment.
-- The source workbook contains formats such as 8.30, 8am, 6:45AM and 730.

create or replace function public.normalize_assignment_start_time(p_value text)
returns text
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  v text := lower(regexp_replace(trim(p_value), '\s+', '', 'g'));
  v_hour integer;
  v_minute integer := 0;
  v_meridiem text;
begin
  if v = '' then return null; end if;
  v := replace(v, '.', ':');

  if v ~ '^\d{3,4}$' then
    v := left(v, length(v) - 2) || ':' || right(v, 2);
  end if;

  v_meridiem := substring(v from '(am|pm)$');
  v := regexp_replace(v, '(am|pm)$', '');
  if v ~ '^\d{1,2}$' then v := v || ':00'; end if;
  if v !~ '^\d{1,2}:\d{2}$' then return trim(p_value); end if;

  v_hour := split_part(v, ':', 1)::integer;
  v_minute := split_part(v, ':', 2)::integer;
  if v_minute > 59 then return trim(p_value); end if;

  if v_meridiem is not null then
    if v_hour < 1 or v_hour > 12 then return trim(p_value); end if;
    if v_meridiem = 'am' and v_hour = 12 then v_hour := 0; end if;
    if v_meridiem = 'pm' and v_hour < 12 then v_hour := v_hour + 12; end if;
  elsif v_hour > 23 then
    return trim(p_value);
  end if;

  return lpad(v_hour::text, 2, '0') || ':' || lpad(v_minute::text, 2, '0');
end;
$$;

revoke all on function public.normalize_assignment_start_time(text) from public;

create or replace function public.populate_assignment_start_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(new.start_time), '') is not null then
    new.start_time := public.normalize_assignment_start_time(new.start_time);
  else
    select public.normalize_assignment_start_time(js.project_start_time)
      into new.start_time
    from public.job_sites js
    where js.id = new.job_site_id;
  end if;
  return new;
end;
$$;

revoke all on function public.populate_assignment_start_time() from public;

drop trigger if exists trg_populate_assignment_start_time on public.job_assignments;
create trigger trg_populate_assignment_start_time
before insert or update of job_site_id, start_time
on public.job_assignments
for each row execute function public.populate_assignment_start_time();

-- Store a consistent value on the job itself, then fill historical assignments.
update public.job_sites
set project_start_time = public.normalize_assignment_start_time(project_start_time)
where nullif(trim(project_start_time), '') is not null;

update public.job_assignments ja
set start_time = public.normalize_assignment_start_time(js.project_start_time)
from public.job_sites js
where js.id = ja.job_site_id
  and nullif(trim(ja.start_time), '') is null
  and nullif(trim(js.project_start_time), '') is not null;

-- Keep inherited assignment times synchronized when a future workbook import
-- changes the job's project start time, without overwriting a custom time.
create or replace function public.propagate_job_site_start_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.job_assignments
  set start_time = public.normalize_assignment_start_time(new.project_start_time)
  where job_site_id = new.id
    and (
      nullif(trim(start_time), '') is null
      or start_time = public.normalize_assignment_start_time(old.project_start_time)
    );
  return new;
end;
$$;

revoke all on function public.propagate_job_site_start_time() from public;

drop trigger if exists trg_propagate_job_site_start_time on public.job_sites;
create trigger trg_propagate_job_site_start_time
after update of project_start_time
on public.job_sites
for each row
when (old.project_start_time is distinct from new.project_start_time)
execute function public.propagate_job_site_start_time();
