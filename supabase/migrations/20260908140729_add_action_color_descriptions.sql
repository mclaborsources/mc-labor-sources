-- Shared descriptions use existing company-settings read/admin-write policies.
alter table public.company_settings
  add column action_color_blue_description varchar(200) not null default 'Normal',
  add column action_color_orange_description varchar(200) not null default '',
  add column action_color_green_description varchar(200) not null default '',
  add column action_color_red_description varchar(200) not null default 'Needs to be set up';
