-- Supabase grants function execution to API roles through default privileges.
-- Restrict the new timesheet functions to their intended callers explicitly.
revoke all on function public.admin_delete_unsent_timesheet(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_delete_unsent_timesheet(uuid)
  to authenticated;

revoke all on function public.set_customer_week_timesheets_bulk_marked(uuid, date, date, boolean)
  from public, anon, authenticated;
grant execute on function public.set_customer_week_timesheets_bulk_marked(uuid, date, date, boolean)
  to authenticated;

revoke all on function public.clear_customer_week_bulk_marks_after_delivery()
  from public, anon, authenticated;
