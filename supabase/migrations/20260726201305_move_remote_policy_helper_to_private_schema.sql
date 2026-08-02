-- The team-role helper is required by the pairing-session RLS policy. Put it
-- in a non-API schema so authenticated policy evaluation can execute it
-- without exposing it as a public PostgREST RPC.

drop policy if exists "Remote operators create their own pairing sessions" on public.worship_remote_pairing_sessions;
create schema if not exists private;
alter function public.is_worship_remote_operator(uuid) set schema private;
revoke all on function private.is_worship_remote_operator(uuid) from public;
revoke all on function private.is_worship_remote_operator(uuid) from anon;
revoke all on function private.is_worship_remote_operator(uuid) from authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_worship_remote_operator(uuid) to authenticated;

create policy "Remote operators create their own pairing sessions"
on public.worship_remote_pairing_sessions for insert to authenticated
with check (created_by = auth.uid() and private.is_worship_remote_operator(team_id));

create or replace function public.claim_worship_remote_pairing(p_session_id uuid, p_pairing_code text)
returns table (setlist_id uuid, channel_secret text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare session_row public.worship_remote_pairing_sessions;
begin
  select * into session_row from public.worship_remote_pairing_sessions where id = p_session_id for update;
  if not found or session_row.revoked_at is not null or session_row.paired_by is not null or session_row.expires_at <= now()
     or session_row.pairing_code_hash <> encode(digest(p_pairing_code, 'sha256'), 'hex') then
    raise exception 'Invalid, already used, or expired pairing code';
  end if;
  if not private.is_worship_remote_operator(session_row.team_id) then
    raise exception 'You do not have Remote permission for this team';
  end if;
  update public.worship_remote_pairing_sessions set paired_by = auth.uid() where id = session_row.id;
  return query select session_row.setlist_id, session_row.channel_secret, session_row.expires_at;
end;
$$;
