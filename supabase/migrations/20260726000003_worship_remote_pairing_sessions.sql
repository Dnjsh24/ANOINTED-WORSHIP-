create extension if not exists pgcrypto;

create table if not exists public.worship_remote_pairing_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  setlist_id uuid not null references public.setlists(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  pairing_code_hash text not null,
  channel_secret text not null,
  paired_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists worship_remote_pairing_sessions_lookup_idx on public.worship_remote_pairing_sessions(id, expires_at);
alter table public.worship_remote_pairing_sessions enable row level security;

create schema if not exists private;

create or replace function private.is_worship_remote_operator(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.profile_id = auth.uid() and tm.status = 'active'
      and tm.role in ('owner', 'admin', 'worship_leader', 'band_leader', 'media')
  );
$$;
revoke all on function private.is_worship_remote_operator(uuid) from public;
revoke all on function private.is_worship_remote_operator(uuid) from anon;
grant usage on schema private to authenticated;
grant execute on function private.is_worship_remote_operator(uuid) to authenticated;

create policy "Remote operators create their own pairing sessions"
on public.worship_remote_pairing_sessions for insert to authenticated
with check (created_by = auth.uid() and private.is_worship_remote_operator(team_id));

create policy "Remote creators read their pairing sessions"
on public.worship_remote_pairing_sessions for select to authenticated
using (created_by = auth.uid());

create policy "Remote creators revoke their pairing sessions"
on public.worship_remote_pairing_sessions for update to authenticated
using (created_by = auth.uid()) with check (created_by = auth.uid());

create or replace function public.claim_worship_remote_pairing(p_session_id uuid, p_pairing_code text)
returns table (setlist_id uuid, channel_secret text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare session_row public.worship_remote_pairing_sessions;
begin
  select * into session_row from public.worship_remote_pairing_sessions where id = p_session_id for update;
  if not found or session_row.revoked_at is not null or session_row.paired_by is not null or session_row.expires_at <= now()
     or session_row.pairing_code_hash <> encode(digest(p_pairing_code, 'sha256'), 'hex') then
    raise exception 'Invalid or expired pairing code';
  end if;
  if not private.is_worship_remote_operator(session_row.team_id) then raise exception 'You do not have Remote permission for this team'; end if;
  update public.worship_remote_pairing_sessions set paired_by = auth.uid() where id = session_row.id;
  return query select session_row.setlist_id, session_row.channel_secret, session_row.expires_at;
end;
$$;
revoke all on function public.claim_worship_remote_pairing(uuid, text) from public;
grant execute on function public.claim_worship_remote_pairing(uuid, text) to authenticated;
