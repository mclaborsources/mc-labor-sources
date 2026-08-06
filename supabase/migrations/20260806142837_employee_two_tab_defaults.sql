alter table public.employees
  alter column mobile_tasks_enabled set default false,
  alter column mobile_messages_enabled set default false,
  alter column mobile_profile_enabled set default false;

update public.employees
set
  mobile_tasks_enabled = false,
  mobile_messages_enabled = false,
  mobile_profile_enabled = false
where
  mobile_tasks_enabled = true
  or mobile_messages_enabled = true
  or mobile_profile_enabled = true;
