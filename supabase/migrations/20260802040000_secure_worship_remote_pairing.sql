-- Secure internet pairing for the website Worship Remote and Windows Presenter.
-- Existing 30-minute desktop pairings remain compatible while new sessions use
-- one-time QR/PIN claims and private session-scoped Realtime topics.

begin;

alter table public.worship_remote_pairing_sessions
  add column if not exists pin_code_hash text,
  add column if not exists claim_expires_at timestamptz;

update public.worship_remote_pairing_sessions
set claim_expires_at = least(expires_at, created_at + interval '10 minutes')
where claim_expires_at is null;

alter table public.worship_remote_pairing_sessions
  alter column claim_expires_at set default (now() + interval '10 minutes'),
  alter column claim_expires_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'worship_remote_pairing_pin_hash_format'
      and conrelid = 'public.worship_remote_pairing_sessions'::regclass
  ) then
    alter table public.worship_remote_pairing_sessions
      add constraint worship_remote_pairing_pin_hash_format
      check (pin_code_hash is null or pin_code_hash ~ '^[0-9a-f]{64}$');
  end if;
end
$$;

create unique index if not exists worship_remote_pairing_active_pin_idx
  on public.worship_remote_pairing_sessions (pin_code_hash)
  where pin_code_hash is not null and paired_by is null and revoked_at is null;

create table if not exists private.worship_remote_pairing_attempts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  failure_count integer not null default 0 check (failure_count >= 0),
  updated_at timestamptz not null default now()
);

revoke all on table private.worship_remote_pairing_attempts from public;
revoke all on table private.worship_remote_pairing_attempts from anon;
revoke all on table private.worship_remote_pairing_attempts from authenticated;

create or replace function private.is_active_worship_remote_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.profile_id = auth.uid()
      and tm.status = 'active'
  );
$$;

revoke all on function private.is_active_worship_remote_member(uuid) from public;
revoke all on function private.is_active_worship_remote_member(uuid) from anon;
revoke all on function private.is_active_worship_remote_member(uuid) from authenticated;
grant execute on function private.is_active_worship_remote_member(uuid) to authenticated;

create or replace function public.create_worship_remote_pairing(p_setlist_id uuid)
returns table (
  session_id uuid,
  qr_token text,
  pin_code text,
  claim_expires_at timestamptz,
  expires_at timestamptz,
  channel_topic text,
  private_channel boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile_id uuid := auth.uid();
  setlist_team_id uuid;
  generated_bytes bytea;
  generated_pin text;
  generated_qr_token text;
  created_session_id uuid;
  created_claim_expires_at timestamptz := clock_timestamp() + interval '10 minutes';
  created_expires_at timestamptz := clock_timestamp() + interval '8 hours';
begin
  if current_profile_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select s.team_id
  into setlist_team_id
  from public.setlists s
  where s.id = p_setlist_id;

  if setlist_team_id is null
    or not private.is_active_worship_remote_member(setlist_team_id)
  then
    raise exception 'Setlist unavailable' using errcode = '42501';
  end if;

  update public.worship_remote_pairing_sessions sessions
  set revoked_at = clock_timestamp()
  where sessions.created_by = current_profile_id
    and sessions.setlist_id = p_setlist_id
    and sessions.revoked_at is null
    and sessions.expires_at > clock_timestamp();

  update public.worship_remote_pairing_sessions sessions
  set revoked_at = clock_timestamp()
  where sessions.revoked_at is null
    and sessions.paired_by is null
    and (
      sessions.claim_expires_at <= clock_timestamp()
      or sessions.expires_at <= clock_timestamp()
    );

  generated_qr_token := encode(extensions.gen_random_bytes(32), 'hex');

  for attempt_number in 1..10 loop
    generated_bytes := extensions.gen_random_bytes(4);
    generated_pin := lpad((
      (
        get_byte(generated_bytes, 0)::bigint * 16777216
        + get_byte(generated_bytes, 1)::bigint * 65536
        + get_byte(generated_bytes, 2)::bigint * 256
        + get_byte(generated_bytes, 3)::bigint
      ) % 1000000
    )::text, 6, '0');

    begin
      insert into public.worship_remote_pairing_sessions (
        team_id,
        setlist_id,
        created_by,
        pairing_code_hash,
        pin_code_hash,
        channel_secret,
        claim_expires_at,
        expires_at
      ) values (
        setlist_team_id,
        p_setlist_id,
        current_profile_id,
        encode(extensions.digest(generated_qr_token, 'sha256'), 'hex'),
        encode(extensions.digest(generated_pin, 'sha256'), 'hex'),
        encode(extensions.gen_random_bytes(32), 'hex'),
        created_claim_expires_at,
        created_expires_at
      )
      returning id into created_session_id;
      exit;
    exception when unique_violation then
      created_session_id := null;
    end;
  end loop;

  if created_session_id is null then
    raise exception 'Could not allocate a pairing code';
  end if;

  return query select
    created_session_id,
    generated_qr_token,
    generated_pin,
    created_claim_expires_at,
    created_expires_at,
    'worship-remote-session:' || created_session_id::text,
    true;
end;
$$;

revoke all on function public.create_worship_remote_pairing(uuid) from public;
revoke all on function public.create_worship_remote_pairing(uuid) from anon;
revoke all on function public.create_worship_remote_pairing(uuid) from authenticated;
grant execute on function public.create_worship_remote_pairing(uuid) to authenticated;

-- Recreate the existing QR claim with additional transport metadata. The first
-- three columns stay unchanged so installed desktop builds remain compatible.
drop function if exists public.claim_worship_remote_pairing(uuid, text);
create function public.claim_worship_remote_pairing(
  p_session_id uuid,
  p_pairing_code text
)
returns table (
  setlist_id uuid,
  channel_secret text,
  expires_at timestamptz,
  session_id uuid,
  team_id uuid,
  channel_topic text,
  private_channel boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_row public.worship_remote_pairing_sessions;
begin
  select *
  into session_row
  from public.worship_remote_pairing_sessions sessions
  where sessions.id = p_session_id
  for update;

  if not found
    or session_row.revoked_at is not null
    or session_row.paired_by is not null
    or session_row.claim_expires_at <= clock_timestamp()
    or session_row.expires_at <= clock_timestamp()
    or p_pairing_code is null
    or session_row.pairing_code_hash
      <> encode(extensions.digest(p_pairing_code, 'sha256'), 'hex')
    or not private.is_active_worship_remote_member(session_row.team_id)
  then
    raise exception 'Invalid, already used, or expired pairing code';
  end if;

  update public.worship_remote_pairing_sessions sessions
  set paired_by = auth.uid()
  where sessions.id = session_row.id;

  return query select
    session_row.setlist_id,
    case
      when session_row.pin_code_hash is null then session_row.channel_secret
      else null::text
    end,
    session_row.expires_at,
    session_row.id,
    session_row.team_id,
    case
      when session_row.pin_code_hash is null
        then 'worship-remote-session:' || session_row.channel_secret
      else 'worship-remote-session:' || session_row.id::text
    end,
    session_row.pin_code_hash is not null;
end;
$$;

revoke all on function public.claim_worship_remote_pairing(uuid, text) from public;
revoke all on function public.claim_worship_remote_pairing(uuid, text) from anon;
revoke all on function public.claim_worship_remote_pairing(uuid, text) from authenticated;
grant execute on function public.claim_worship_remote_pairing(uuid, text) to authenticated;

create or replace function public.claim_worship_remote_pairing_by_pin(p_pin_code text)
returns table (
  session_id uuid,
  setlist_id uuid,
  team_id uuid,
  expires_at timestamptz,
  channel_topic text,
  private_channel boolean,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile_id uuid := auth.uid();
  session_row public.worship_remote_pairing_sessions;
  current_failure_count integer;
  current_window_started_at timestamptz;
begin
  if current_profile_id is null then
    return query select null::uuid, null::uuid, null::uuid, null::timestamptz, null::text, null::boolean, 'auth_required'::text;
    return;
  end if;

  insert into private.worship_remote_pairing_attempts (profile_id)
  values (current_profile_id)
  on conflict (profile_id) do nothing;

  select attempts.failure_count, attempts.window_started_at
  into current_failure_count, current_window_started_at
  from private.worship_remote_pairing_attempts attempts
  where attempts.profile_id = current_profile_id
  for update;

  if current_window_started_at + interval '10 minutes' <= clock_timestamp() then
    update private.worship_remote_pairing_attempts attempts
    set failure_count = 0,
        window_started_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where attempts.profile_id = current_profile_id;
    current_failure_count := 0;
  end if;

  if current_failure_count >= 5 then
    return query select null::uuid, null::uuid, null::uuid, null::timestamptz, null::text, null::boolean, 'rate_limited'::text;
    return;
  end if;

  if p_pin_code ~ '^[0-9]{6}$' then
    select *
    into session_row
    from public.worship_remote_pairing_sessions sessions
    where sessions.pin_code_hash = encode(extensions.digest(p_pin_code, 'sha256'), 'hex')
      and sessions.paired_by is null
      and sessions.revoked_at is null
      and sessions.claim_expires_at > clock_timestamp()
      and sessions.expires_at > clock_timestamp()
    for update;
  end if;

  if session_row.id is null
    or not private.is_active_worship_remote_member(session_row.team_id)
  then
    update private.worship_remote_pairing_attempts attempts
    set failure_count = attempts.failure_count + 1,
        updated_at = clock_timestamp()
    where attempts.profile_id = current_profile_id
    returning attempts.failure_count into current_failure_count;

    return query select
      null::uuid,
      null::uuid,
      null::uuid,
      null::timestamptz,
      null::text,
      null::boolean,
      case when current_failure_count >= 5 then 'rate_limited' else 'invalid' end;
    return;
  end if;

  update public.worship_remote_pairing_sessions sessions
  set paired_by = current_profile_id
  where sessions.id = session_row.id;

  delete from private.worship_remote_pairing_attempts attempts
  where attempts.profile_id = current_profile_id;

  return query select
    session_row.id,
    session_row.setlist_id,
    session_row.team_id,
    session_row.expires_at,
    'worship-remote-session:' || session_row.id::text,
    true,
    null::text;
end;
$$;

revoke all on function public.claim_worship_remote_pairing_by_pin(text) from public;
revoke all on function public.claim_worship_remote_pairing_by_pin(text) from anon;
revoke all on function public.claim_worship_remote_pairing_by_pin(text) from authenticated;
grant execute on function public.claim_worship_remote_pairing_by_pin(text) to authenticated;

create or replace function public.resume_worship_remote_pairing(p_session_id uuid)
returns table (
  session_id uuid,
  setlist_id uuid,
  team_id uuid,
  expires_at timestamptz,
  channel_topic text,
  private_channel boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sessions.id,
    sessions.setlist_id,
    sessions.team_id,
    sessions.expires_at,
    case
      when sessions.pin_code_hash is null
        then 'worship-remote-session:' || sessions.channel_secret
      else 'worship-remote-session:' || sessions.id::text
    end,
    sessions.pin_code_hash is not null
  from public.worship_remote_pairing_sessions sessions
  where sessions.id = p_session_id
    and sessions.revoked_at is null
    and sessions.expires_at > clock_timestamp()
    and (sessions.created_by = auth.uid() or sessions.paired_by = auth.uid())
    and private.is_active_worship_remote_member(sessions.team_id);
$$;

revoke all on function public.resume_worship_remote_pairing(uuid) from public;
revoke all on function public.resume_worship_remote_pairing(uuid) from anon;
revoke all on function public.resume_worship_remote_pairing(uuid) from authenticated;
grant execute on function public.resume_worship_remote_pairing(uuid) to authenticated;

create or replace function public.revoke_worship_remote_pairing(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  revoked_session_id uuid;
begin
  update public.worship_remote_pairing_sessions sessions
  set revoked_at = coalesce(sessions.revoked_at, clock_timestamp())
  where sessions.id = p_session_id
    and sessions.created_by = auth.uid()
    and private.is_active_worship_remote_member(sessions.team_id)
  returning sessions.id into revoked_session_id;

  return revoked_session_id is not null;
end;
$$;

revoke all on function public.revoke_worship_remote_pairing(uuid) from public;
revoke all on function public.revoke_worship_remote_pairing(uuid) from anon;
revoke all on function public.revoke_worship_remote_pairing(uuid) from authenticated;
grant execute on function public.revoke_worship_remote_pairing(uuid) to authenticated;

create or replace function private.can_access_worship_remote_session(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.worship_remote_pairing_sessions sessions
    join public.team_members members
      on members.team_id = sessions.team_id
     and members.profile_id = auth.uid()
     and members.status = 'active'
    where p_topic = 'worship-remote-session:' || sessions.id::text
      and sessions.revoked_at is null
      and sessions.expires_at > clock_timestamp()
      and (sessions.created_by = auth.uid() or sessions.paired_by = auth.uid())
  );
$$;

revoke all on function private.can_access_worship_remote_session(text) from public;
revoke all on function private.can_access_worship_remote_session(text) from anon;
revoke all on function private.can_access_worship_remote_session(text) from authenticated;
grant execute on function private.can_access_worship_remote_session(text) to authenticated;

drop policy if exists "Worship remote operators can receive private broadcasts" on realtime.messages;
create policy "Worship remote operators can receive private broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.private = true
  and (
    (
      split_part(realtime.topic(), ':', 1) = 'worship-remote'
      and exists (
        select 1
        from public.setlists setlists
        join public.team_members members on members.team_id = setlists.team_id
        where setlists.id::text = split_part(realtime.topic(), ':', 2)
          and members.profile_id = (select auth.uid())
          and members.status = 'active'
          and members.role in ('owner', 'admin', 'worship_leader', 'band_leader', 'media')
      )
    )
    or private.can_access_worship_remote_session(realtime.topic())
  )
);

drop policy if exists "Worship remote operators can send private broadcasts" on realtime.messages;
create policy "Worship remote operators can send private broadcasts"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.private = true
  and (
    (
      split_part(realtime.topic(), ':', 1) = 'worship-remote'
      and exists (
        select 1
        from public.setlists setlists
        join public.team_members members on members.team_id = setlists.team_id
        where setlists.id::text = split_part(realtime.topic(), ':', 2)
          and members.profile_id = (select auth.uid())
          and members.status = 'active'
          and members.role in ('owner', 'admin', 'worship_leader', 'band_leader', 'media')
      )
    )
    or private.can_access_worship_remote_session(realtime.topic())
  )
);

commit;
