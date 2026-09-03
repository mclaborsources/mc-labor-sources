alter table if exists public.employees
  add column if not exists action_button_color text not null default 'BLUE';

alter table if exists public.employees
  drop constraint if exists employees_action_button_color_check;

alter table if exists public.employees
  add constraint employees_action_button_color_check
  check (action_button_color in ('RED', 'ORANGE', 'GREEN', 'BLUE'));

comment on column public.employees.action_button_color is
  'Admin-selected color for this employee''s Actions button on the assignments table.';

-- Make the new column available to PostgREST immediately after deployment.
notify pgrst, 'reload schema';
