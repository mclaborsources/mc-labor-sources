-- Return only the caller's session status; never expose another user's sessions.
create or replace function public.is_current_auth_session_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    where s.user_id = auth.uid()
      and s.id::text = auth.jwt()->>'session_id'
  );
$$;

revoke all on function public.is_current_auth_session_active() from public, anon;
grant execute on function public.is_current_auth_session_active() to authenticated;
