-- Revoke every refreshable Auth session for one worker without deleting or
-- disabling their account. Existing access JWTs remain valid until expiry.
create or replace function public.revoke_worker_auth_sessions(p_auth_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revoked integer;
begin
  if p_auth_user_id is null then
    raise exception 'Auth user id is required';
  end if;

  delete from auth.sessions
  where user_id = p_auth_user_id;

  get diagnostics v_revoked = row_count;
  return v_revoked;
end;
$$;

revoke all on function public.revoke_worker_auth_sessions(uuid) from public;
revoke all on function public.revoke_worker_auth_sessions(uuid) from anon;
revoke all on function public.revoke_worker_auth_sessions(uuid) from authenticated;
grant execute on function public.revoke_worker_auth_sessions(uuid) to service_role;
