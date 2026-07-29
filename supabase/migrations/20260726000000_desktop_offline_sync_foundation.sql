-- Offline-first desktop foundation. This migration is additive: existing
-- installations retain their worship data and get the new sync metadata.
alter table public.songs add column if not exists album text;
alter table public.songs add column if not exists sync_revision bigint not null default 0;
alter table public.setlists add column if not exists deleted_at timestamptz;
alter table public.setlists add column if not exists sync_revision bigint not null default 0;
alter table public.setlist_songs add column if not exists slide_settings jsonb;
alter table public.setlist_songs add column if not exists deleted_at timestamptz;
alter table public.setlist_songs add column if not exists updated_at timestamptz not null default now();
alter table public.setlist_songs add column if not exists sync_revision bigint not null default 0;
alter table public.events add column if not exists deleted_at timestamptz;
alter table public.events add column if not exists sync_revision bigint not null default 0;

create table if not exists public.presentation_assets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  storage_path text not null,
  asset_type text not null,
  byte_size bigint not null default 0,
  sha256 text,
  sync_revision bigint not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, storage_path)
);

create table if not exists public.worship_sync_changes (
  cursor bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null check (operation in ('upsert', 'delete')),
  revision bigint not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists worship_sync_changes_team_cursor_idx on public.worship_sync_changes(team_id, cursor);

create table if not exists public.worship_sync_receipts (
  device_id text not null,
  mutation_id uuid not null,
  team_id uuid not null references public.teams(id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (device_id, mutation_id)
);

alter table public.presentation_assets enable row level security;
alter table public.worship_sync_changes enable row level security;
alter table public.worship_sync_receipts enable row level security;

drop policy if exists "Team members can view presentation assets" on public.presentation_assets;
create policy "Team members can view presentation assets" on public.presentation_assets for select to authenticated
using (exists (select 1 from public.team_members tm where tm.team_id = presentation_assets.team_id and tm.profile_id = auth.uid() and tm.status = 'active'));

-- Changes and receipts are deliberately API-private; sync RPCs below are the
-- only access path and run as the signed-in caller (security invoker).

create or replace function public.bootstrap_worship_cache()
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_team_id uuid;
begin
  select tm.team_id into v_team_id from public.team_members tm
  where tm.profile_id = auth.uid() and tm.status = 'active' order by tm.created_at desc limit 1;
  if v_team_id is null then raise exception 'Active team membership required' using errcode = '28000'; end if;
  return jsonb_build_object(
    'team_id', v_team_id,
    'songs', coalesce((select jsonb_agg(to_jsonb(s)) from public.songs s where s.team_id = v_team_id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(e)) from public.events e where e.team_id = v_team_id), '[]'::jsonb),
    'setlists', coalesce((select jsonb_agg(to_jsonb(sl)) from public.setlists sl where sl.team_id = v_team_id), '[]'::jsonb),
    'setlist_songs', coalesce((select jsonb_agg(to_jsonb(ss)) from public.setlist_songs ss join public.setlists sl on sl.id = ss.setlist_id where sl.team_id = v_team_id), '[]'::jsonb),
    'cursor', coalesce((select max(c.cursor) from public.worship_sync_changes c where c.team_id = v_team_id), 0)
  );
end; $$;

create or replace function public.pull_worship_changes(after_cursor bigint default 0)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_team_id uuid;
begin
  select tm.team_id into v_team_id from public.team_members tm where tm.profile_id = auth.uid() and tm.status = 'active' order by tm.created_at desc limit 1;
  if v_team_id is null then raise exception 'Active team membership required' using errcode = '28000'; end if;
  return jsonb_build_object('changes', coalesce((select jsonb_agg(to_jsonb(c) order by c.cursor) from public.worship_sync_changes c where c.team_id = v_team_id and c.cursor > after_cursor), '[]'::jsonb), 'cursor', coalesce((select max(c.cursor) from public.worship_sync_changes c where c.team_id = v_team_id), after_cursor));
end; $$;

create or replace function public.apply_worship_mutation(
  p_device_id text, p_mutation_id uuid, p_command text, p_payload jsonb, p_base_revision bigint default 0
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_team_id uuid; v_existing jsonb; v_current_revision bigint; v_result jsonb; v_song_id uuid;
begin
  select tm.team_id into v_team_id from public.team_members tm where tm.profile_id = auth.uid() and tm.status = 'active' order by tm.created_at desc limit 1;
  if v_team_id is null then raise exception 'Active team membership required' using errcode = '28000'; end if;
  select result into v_existing from public.worship_sync_receipts where device_id = p_device_id and mutation_id = p_mutation_id;
  if v_existing is not null then return v_existing; end if;
  if coalesce(p_payload->>'teamId', '')::uuid <> v_team_id then raise exception 'Team mismatch' using errcode = '42501'; end if;

  if p_command in ('song.create', 'song.update') then
    v_song_id := (p_payload->>'id')::uuid;
    select sync_revision into v_current_revision from public.songs where id = v_song_id and team_id = v_team_id;
    if p_command = 'song.update' and coalesce(v_current_revision, 0) <> p_base_revision then
      return jsonb_build_object('status', 'conflict', 'cloud_payload', (select to_jsonb(s) from public.songs s where s.id = v_song_id));
    end if;
    insert into public.songs (id, team_id, title, artist, original_key, bpm, time_signature, lyrics_chords, youtube_url, spotify_url, image_url, album, tags, created_by, sync_revision, updated_at, deleted_at)
    values (v_song_id, v_team_id, p_payload->>'title', p_payload->>'artist', p_payload->>'originalKey', nullif(p_payload->>'bpm','')::integer, coalesce(p_payload->>'timeSignature','4/4'), coalesce(p_payload->>'lyricsChords',''), nullif(p_payload->>'youtubeUrl',''), nullif(p_payload->>'spotifyUrl',''), nullif(p_payload->>'imageUrl',''), nullif(p_payload->>'album',''), array[]::text[], auth.uid(), 1, now(), null)
    on conflict (id) do update set title = excluded.title, artist = excluded.artist, original_key = excluded.original_key, bpm = excluded.bpm, time_signature = excluded.time_signature, lyrics_chords = excluded.lyrics_chords, youtube_url = excluded.youtube_url, spotify_url = excluded.spotify_url, image_url = excluded.image_url, album = excluded.album, deleted_at = null, sync_revision = public.songs.sync_revision + 1, updated_at = now();
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.songs where id = v_song_id;
    insert into public.worship_sync_changes (team_id, entity_type, entity_id, operation, revision, payload) values (v_team_id, 'song', v_song_id, 'upsert', (v_result->>'revision')::bigint, (select to_jsonb(s) from public.songs s where s.id = v_song_id));
  elsif p_command in ('song.delete', 'song.restore') then
    v_song_id := (p_payload->>'id')::uuid;
    update public.songs set deleted_at = case when p_command = 'song.delete' then now() else null end, sync_revision = sync_revision + 1, updated_at = now() where id = v_song_id and team_id = v_team_id and sync_revision = p_base_revision;
    if not found then return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(s) from public.songs s where s.id = v_song_id)); end if;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.songs where id = v_song_id;
    insert into public.worship_sync_changes (team_id, entity_type, entity_id, operation, revision, payload) values (v_team_id, 'song', v_song_id, case when p_command = 'song.delete' then 'delete' else 'upsert' end, (v_result->>'revision')::bigint, (select to_jsonb(s) from public.songs s where s.id = v_song_id));
  elsif p_command in ('setlist.create', 'setlist.update') then
    v_song_id := (p_payload->>'id')::uuid;
    select sync_revision into v_current_revision from public.setlists where id = v_song_id and team_id = v_team_id;
    if p_command = 'setlist.update' and coalesce(v_current_revision, 0) <> p_base_revision then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id = v_song_id));
    end if;
    insert into public.events (id, team_id, type, name, event_date, location, starts_at, call_time, rehearsal_time, created_by, deleted_at, sync_revision)
    values ((p_payload->>'eventId')::uuid, v_team_id, coalesce(p_payload->>'eventType','service'), p_payload->>'name', (p_payload->>'date')::date, nullif(p_payload->>'location',''), nullif(p_payload->>'callTime','')::time, nullif(p_payload->>'callTime','')::time, nullif(p_payload->>'rehearsalTime','')::time, auth.uid(), null, 1)
    on conflict (id) do update set type=excluded.type, name=excluded.name, event_date=excluded.event_date, location=excluded.location, starts_at=excluded.starts_at, call_time=excluded.call_time, rehearsal_time=excluded.rehearsal_time, deleted_at=null, sync_revision=public.events.sync_revision + 1, updated_at=now();
    insert into public.setlists (id, team_id, event_id, name, setlist_date, location, call_time, rehearsal_time, service_times, notes, created_by, deleted_at, sync_revision, updated_at)
    values (v_song_id, v_team_id, (p_payload->>'eventId')::uuid, p_payload->>'name', (p_payload->>'date')::date, nullif(p_payload->>'location',''), nullif(p_payload->>'callTime','')::time, nullif(p_payload->>'rehearsalTime','')::time, coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'serviceTimes','[]'::jsonb))), array[]::text[]), nullif(p_payload->>'notes',''), auth.uid(), null, 1, now())
    on conflict (id) do update set event_id=excluded.event_id, name=excluded.name, setlist_date=excluded.setlist_date, location=excluded.location, call_time=excluded.call_time, rehearsal_time=excluded.rehearsal_time, service_times=excluded.service_times, notes=excluded.notes, deleted_at=null, sync_revision=public.setlists.sync_revision + 1, updated_at=now();
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.setlists where id = v_song_id;
    insert into public.worship_sync_changes (team_id, entity_type, entity_id, operation, revision, payload) values (v_team_id, 'setlist', v_song_id, 'upsert', (v_result->>'revision')::bigint, (select to_jsonb(sl) from public.setlists sl where sl.id = v_song_id));
  elsif p_command = 'setlist.delete' then
    v_song_id := (p_payload->>'id')::uuid;
    update public.setlist_songs set deleted_at=now(), sync_revision=sync_revision+1, updated_at=now() where setlist_id=v_song_id;
    update public.setlists set deleted_at=now(), sync_revision=sync_revision+1, updated_at=now() where id=v_song_id and team_id=v_team_id and sync_revision=p_base_revision;
    if not found then return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id=v_song_id)); end if;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.setlists where id=v_song_id;
    insert into public.worship_sync_changes (team_id, entity_type, entity_id, operation, revision, payload) values (v_team_id, 'setlist', v_song_id, 'delete', (v_result->>'revision')::bigint, (select to_jsonb(sl) from public.setlists sl where sl.id=v_song_id));
  else
    raise exception 'Unsupported worship mutation: %', p_command using errcode = '22023';
  end if;
  insert into public.worship_sync_receipts (device_id, mutation_id, team_id, result) values (p_device_id, p_mutation_id, v_team_id, v_result);
  return v_result;
end; $$;

revoke all on function public.bootstrap_worship_cache() from public, anon;
revoke all on function public.pull_worship_changes(bigint) from public, anon;
revoke all on function public.apply_worship_mutation(text, uuid, text, jsonb, bigint) from public, anon;
grant execute on function public.bootstrap_worship_cache() to authenticated;
grant execute on function public.pull_worship_changes(bigint) to authenticated;
grant execute on function public.apply_worship_mutation(text, uuid, text, jsonb, bigint) to authenticated;
