create policy notification_scripts_admin_delete on public.notification_scripts for delete to authenticated using (public.is_admin());
grant delete on public.notification_scripts to authenticated;
