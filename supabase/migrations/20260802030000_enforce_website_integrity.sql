-- Forward-only remediation for website authorization and transactional
-- integrity. Historical migrations remain untouched by this migration.

alter table public.songs
  add column if not exists seed_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.songs'::regclass
      and conname = 'songs_seed_source_check'
  ) then
    alter table public.songs
      add constraint songs_seed_source_check
      check (seed_source is null or seed_source = 'starter-library-v1');
  end if;
end
$$;

create index if not exists songs_team_seed_source_idx
  on public.songs (team_id, seed_source)
  where seed_source is not null;

-- The website already exposes recurring events. Restore the persisted contract
-- as a forward migration so generated database types match runtime behavior.
alter table public.events
  add column if not exists recurrence_rule text
    check (recurrence_rule in ('none', 'weekly', 'biweekly', 'monthly')),
  add column if not exists recurrence_parent_id uuid;

alter table public.events
  drop constraint if exists events_recurrence_parent_id_fkey;
alter table public.events
  add constraint events_recurrence_parent_id_fkey
  foreign key (recurrence_parent_id)
  references public.events(id)
  on delete set null;

create index if not exists events_recurrence_parent_idx
  on public.events (recurrence_parent_id)
  where recurrence_parent_id is not null;

-- Presentation backgrounds contain team-specific media. Keep stable object
-- paths in settings and mint short-lived URLs only for authenticated viewers.
update storage.buckets
set public = false
where id = 'presentation-media';

create or replace function private.can_read_presentation_media(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.team_members tm
    where tm.team_id::text = (storage.foldername(object_name))[1]
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
  ), false);
$$;

revoke all on function private.can_read_presentation_media(text)
  from public, anon, authenticated;
grant execute on function private.can_read_presentation_media(text)
  to authenticated;

drop policy if exists "Public can read presentation media" on storage.objects;
drop policy if exists "Team members can read presentation media" on storage.objects;
create policy "Team members can read presentation media"
on storage.objects for select to authenticated
using (
  bucket_id = 'presentation-media'
  and private.can_read_presentation_media(name)
);

-- The workspace bootstrap performs a bounded, authenticated multi-table
-- transaction. It must run as its owner because the first membership cannot
-- satisfy membership-based RLS before it exists.
alter function public.create_team_workspace(text, text, text, time, time)
  security definer;
alter function public.create_team_workspace(text, text, text, time, time)
  set search_path = '';
revoke all on function public.create_team_workspace(text, text, text, time, time)
  from public, anon, authenticated;
grant execute on function public.create_team_workspace(text, text, text, time, time)
  to authenticated;

-- Ownership is not an ordinary member role mutation. Generic UPDATE/DELETE
-- operations can never create or remove owners; transfer_team_ownership is the
-- only workflow that temporarily enables those changes inside one transaction.
create or replace function private.guard_team_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_enabled boolean :=
    coalesce(current_setting('app.transfer_team_ownership', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' and not transfer_enabled then
      raise exception using
        errcode = '42501',
        message = 'cannot remove the final team owner';
    end if;
    return old;
  end if;

  if old.role = 'owner'
     and (
       new.role <> 'owner'
       or new.status <> 'active'
       or new.team_id <> old.team_id
       or new.profile_id <> old.profile_id
       or new.custom_role_id is distinct from old.custom_role_id
     )
     and not transfer_enabled then
    raise exception using
      errcode = '42501',
      message = 'cannot remove the final team owner';
  end if;
  if old.role <> 'owner' and new.role = 'owner' and not transfer_enabled then
    raise exception using
      errcode = '42501',
      message = 'team ownership must use transfer_team_ownership';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_team_owner_membership()
  from public, anon, authenticated;

drop trigger if exists team_members_guard_owner on public.team_members;
create trigger team_members_guard_owner
before update of role, status, team_id, profile_id, custom_role_id or delete on public.team_members
for each row execute function private.guard_team_owner_membership();

create or replace function public.transfer_team_ownership(
  p_team_id uuid,
  p_new_owner_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_member public.team_members%rowtype;
  next_owner public.team_members%rowtype;
begin
  select tm.*
  into actor_member
  from public.team_members tm
  join public.teams t
    on t.id = tm.team_id
   and t.owner_id = tm.profile_id
  where tm.team_id = p_team_id
    and tm.profile_id = auth.uid()
    and tm.status = 'active'
    and tm.role = 'owner'
  for update of tm;

  if actor_member.id is null then
    raise exception using errcode = '42501', message = 'only the current owner can transfer ownership';
  end if;

  select tm.*
  into next_owner
  from public.team_members tm
  where tm.id = p_new_owner_member_id
    and tm.team_id = p_team_id
    and tm.status = 'active'
  for update;

  if next_owner.id is null then
    raise exception using errcode = '22023', message = 'new owner must be an active member of the same team';
  end if;
  if next_owner.id = actor_member.id then
    return;
  end if;

  perform set_config('app.transfer_team_ownership', 'on', true);

  update public.team_members
  set role = 'owner', custom_role_id = null, updated_at = now()
  where id = next_owner.id;

  update public.team_members
  set role = 'admin', custom_role_id = null, updated_at = now()
  where id = actor_member.id;

  update public.teams
  set owner_id = next_owner.profile_id, updated_at = now()
  where id = p_team_id;
end;
$$;

revoke all on function public.transfer_team_ownership(uuid, uuid)
  from public, anon;
grant execute on function public.transfer_team_ownership(uuid, uuid)
  to authenticated;

-- Restrict generic member policies so admins cannot manufacture or destroy an
-- owner even when calling PostgREST directly.
drop policy if exists "Admins can manage team members" on public.team_members;
drop policy if exists "Authorized users can delete team members" on public.team_members;
drop policy if exists "Authorized users can insert team members" on public.team_members;

create policy "Owners and admins can update team members"
on public.team_members for update to authenticated
using (
  private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
)
with check (
  private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
);

create policy "Authorized users can delete non-owner members"
on public.team_members for delete to authenticated
using (
  role <> 'owner'
  and (
    profile_id = (select auth.uid())
    or private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
  )
);

create policy "Authorized users can insert non-owner members"
on public.team_members for insert to authenticated
with check (
  (
    role <> 'owner'
    and private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
  )
  or (
    profile_id = (select auth.uid())
    and role = 'owner'
    and status = 'active'
    and private.is_team_owner(team_id)
    and not exists (
      select 1 from public.team_members existing where existing.team_id = team_members.team_id
    )
  )
);

-- Join requests are untrusted input. Submission fields are constrained at RLS,
-- and a trigger makes their identity/role immutable during review.
drop policy if exists "Users can submit join requests" on public.join_requests;
create policy "join_requests_valid_submission"
on public.join_requests for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and status = 'pending'
  and requested_role not in ('owner', 'admin')
  and reviewed_by is null
  and reviewed_at is null
);

create or replace function private.validate_join_request_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.team_id <> old.team_id
     or new.profile_id <> old.profile_id
     or new.requested_role <> old.requested_role then
    raise exception using errcode = '42501', message = 'join request identity and role are immutable';
  end if;
  if old.status <> 'pending' then
    raise exception using errcode = '42501', message = 'only pending join requests may be reviewed';
  end if;

  if new.status = 'canceled' then
    if old.profile_id <> auth.uid()
       or new.reviewed_by is not null
       or new.reviewed_at is not null then
      raise exception using errcode = '42501', message = 'invalid join request cancellation';
    end if;
  elsif new.status in ('approved', 'rejected') then
    if not private.has_team_role(old.team_id, array['owner', 'admin']::public.team_role[])
       or new.reviewed_by is distinct from auth.uid()
       or new.reviewed_at is null then
      raise exception using errcode = '42501', message = 'invalid join request review';
    end if;
  else
    raise exception using errcode = '42501', message = 'invalid join request transition';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_join_request_transition()
  from public, anon, authenticated;

drop trigger if exists join_requests_validate_transition on public.join_requests;
create trigger join_requests_validate_transition
before update on public.join_requests
for each row execute function private.validate_join_request_transition();

drop policy if exists "Authorized users can update join requests" on public.join_requests;
create policy "Authorized users can update pending join requests"
on public.join_requests for update to authenticated
using (
  status = 'pending'
  and (
    profile_id = (select auth.uid())
    or private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
  )
)
with check (
  (
    profile_id = (select auth.uid())
    and status = 'canceled'
    and reviewed_by is null
    and reviewed_at is null
  )
  or (
    private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
    and status in ('approved', 'rejected')
    and reviewed_by = (select auth.uid())
    and reviewed_at is not null
  )
);

create or replace function public.review_join_request(
  p_request_id uuid,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.join_requests%rowtype;
  approved_member_id uuid;
  default_channel_id uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid join request decision';
  end if;

  select *
  into request_row
  from public.join_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if request_row.id is null
     or not private.has_team_role(
       request_row.team_id,
       array['owner', 'admin']::public.team_role[]
     ) then
    raise exception using errcode = '42501', message = 'join request cannot be reviewed';
  end if;
  if request_row.requested_role in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'privileged roles cannot be requested';
  end if;

  if p_decision = 'approved' then
    insert into public.team_members (
      team_id, profile_id, role, status, ministry, custom_role_id
    )
    values (
      request_row.team_id,
      request_row.profile_id,
      request_row.requested_role,
      'active',
      initcap(replace(request_row.requested_role::text, '_', ' ')),
      null
    )
    on conflict (team_id, profile_id) do update
      set role = excluded.role,
          status = 'active',
          ministry = excluded.ministry,
          custom_role_id = null,
          updated_at = now()
    returning id into approved_member_id;

    select id
    into default_channel_id
    from public.message_channels
    where team_id = request_row.team_id
      and channel_type = 'team'
    order by created_at
    limit 1;

    if default_channel_id is not null then
      insert into public.message_channel_members (channel_id, team_member_id)
      values (default_channel_id, approved_member_id)
      on conflict (channel_id, team_member_id) do nothing;
    end if;
  end if;

  update public.join_requests
  set status = p_decision::public.join_request_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = request_row.id;

  return p_decision;
end;
$$;

revoke all on function public.review_join_request(uuid, text) from public, anon;
grant execute on function public.review_join_request(uuid, text) to authenticated;

-- Tenant-consistency triggers protect writes made through PostgREST, RPCs, and
-- future service-role jobs.
create or replace function private.validate_setlist_song_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  setlist_team uuid;
begin
  select team_id into setlist_team from public.setlists where id = new.setlist_id;
  if setlist_team is null
     or not exists (
       select 1 from public.songs s
       where s.id = new.song_id and s.team_id = setlist_team
     )
     or (
       new.lead_member_id is not null
       and not exists (
         select 1 from public.team_members tm
         where tm.id = new.lead_member_id and tm.team_id = setlist_team
       )
     ) then
    raise exception using
      errcode = '23514',
      message = 'setlist song references must belong to the same team';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_setlist_song_team()
  from public, anon, authenticated;
drop trigger if exists setlist_songs_validate_team on public.setlist_songs;
create trigger setlist_songs_validate_team
before insert or update of setlist_id, song_id, lead_member_id
on public.setlist_songs
for each row execute function private.validate_setlist_song_team();

create or replace function private.validate_event_assignment_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.events e
    join public.team_members tm on tm.team_id = e.team_id
    where e.id = new.event_id and tm.id = new.team_member_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'event assignment references must belong to the same team';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_event_assignment_team()
  from public, anon, authenticated;
drop trigger if exists event_assignments_validate_team on public.event_assignments;
create trigger event_assignments_validate_team
before insert or update of event_id, team_member_id
on public.event_assignments
for each row execute function private.validate_event_assignment_team();

create or replace function private.validate_dance_note_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.song_id is not null
    and not exists (
      select 1 from public.songs s
      where s.id = new.song_id and s.team_id = new.team_id
    )
  ) or (
    new.event_id is not null
    and not exists (
      select 1 from public.events e
      where e.id = new.event_id and e.team_id = new.team_id
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'dance note references must belong to the same team';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_dance_note_team()
  from public, anon, authenticated;
drop trigger if exists dance_notes_validate_team on public.dance_notes;
create trigger dance_notes_validate_team
before insert or update of team_id, song_id, event_id
on public.dance_notes
for each row execute function private.validate_dance_note_team();

-- Bounded transactional mutation RPCs.
create or replace function public.add_setlist_songs(
  p_setlist_id uuid,
  p_songs jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  setlist_team uuid;
  starting_order integer;
  inserted_count integer;
begin
  if coalesce(jsonb_typeof(p_songs), '') <> 'array'
     or jsonb_array_length(p_songs) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'setlist song batch must contain 1 to 100 rows';
  end if;

  select team_id into setlist_team
  from public.setlists
  where id = p_setlist_id
  for update;

  if setlist_team is null
     or not private.has_team_role(
       setlist_team,
       array['owner', 'admin', 'worship_leader', 'band_leader']::public.team_role[]
     ) then
    raise exception using errcode = '42501', message = 'setlist cannot be modified';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_songs) item
    left join public.songs s
      on s.id = (item->>'song_id')::uuid
     and s.team_id = setlist_team
    where s.id is null
       or length(item->>'assigned_key') not between 1 and 3
       or coalesce(item->>'type', '') not in ('Worship', 'Praise', 'None')
  ) then
    raise exception using errcode = '23514', message = 'setlist songs must belong to the same team';
  end if;

  select coalesce(max(song_order), 0)
  into starting_order
  from public.setlist_songs
  where setlist_id = p_setlist_id;

  insert into public.setlist_songs (
    setlist_id, song_id, song_order, assigned_key, notes
  )
  select
    p_setlist_id,
    (item->>'song_id')::uuid,
    starting_order + ordinality::integer,
    item->>'assigned_key',
    case
      when item->>'type' = 'None' then null
      else (item->>'type') || ' Song'
    end
  from jsonb_array_elements(p_songs) with ordinality rows(item, ordinality);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.add_setlist_songs(uuid, jsonb) from public, anon;
grant execute on function public.add_setlist_songs(uuid, jsonb) to authenticated;

create or replace function public.reorder_setlist_songs(
  p_setlist_id uuid,
  p_updates jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  setlist_team uuid;
  item_count integer;
  current_count integer;
  offset_value integer;
begin
  if coalesce(jsonb_typeof(p_updates), '') <> 'array'
     or jsonb_array_length(p_updates) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'reorder batch must contain 1 to 200 rows';
  end if;
  item_count := jsonb_array_length(p_updates);

  select team_id into setlist_team
  from public.setlists
  where id = p_setlist_id
  for update;

  if setlist_team is null
     or not private.has_team_role(
       setlist_team,
       array['owner', 'admin', 'worship_leader', 'band_leader']::public.team_role[]
     ) then
    raise exception using errcode = '42501', message = 'setlist cannot be reordered';
  end if;

  select count(*), coalesce(max(song_order), 0) + 10000
  into current_count, offset_value
  from public.setlist_songs
  where setlist_id = p_setlist_id;

  if current_count <> item_count
     or (
       select count(distinct (item->>'id')::uuid) <> item_count
          or count(distinct (item->>'song_order')::integer) <> item_count
          or min((item->>'song_order')::integer) <> 1
          or max((item->>'song_order')::integer) <> item_count
       from jsonb_array_elements(p_updates) item
     )
     or (
       select count(*) <> item_count
       from public.setlist_songs ss
       join jsonb_array_elements(p_updates) item
         on ss.id = (item->>'id')::uuid
       where ss.setlist_id = p_setlist_id
     ) then
    raise exception using errcode = '22023', message = 'reorder batch must cover the setlist exactly once';
  end if;

  update public.setlist_songs ss
  set song_order = offset_value + rows.ordinality::integer
  from jsonb_array_elements(p_updates) with ordinality rows(item, ordinality)
  where ss.id = (rows.item->>'id')::uuid
    and ss.setlist_id = p_setlist_id;

  update public.setlist_songs ss
  set song_order = (rows.item->>'song_order')::integer
  from jsonb_array_elements(p_updates) rows(item)
  where ss.id = (rows.item->>'id')::uuid
    and ss.setlist_id = p_setlist_id;

  return item_count;
end;
$$;

revoke all on function public.reorder_setlist_songs(uuid, jsonb) from public, anon;
grant execute on function public.reorder_setlist_songs(uuid, jsonb) to authenticated;

create or replace function public.delete_setlist_cascade(p_setlist_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  setlist_team uuid;
  linked_event uuid;
begin
  select team_id, event_id
  into setlist_team, linked_event
  from public.setlists
  where id = p_setlist_id
  for update;
  if setlist_team is null
     or not private.has_team_role(
       setlist_team,
       array['owner', 'admin', 'worship_leader', 'band_leader']::public.team_role[]
     ) then
    raise exception using errcode = '42501', message = 'setlist cannot be deleted';
  end if;
  delete from public.setlists where id = p_setlist_id;
  if linked_event is not null then
    delete from public.events where id = linked_event and team_id = setlist_team;
  end if;
end;
$$;

revoke all on function public.delete_setlist_cascade(uuid) from public, anon;
grant execute on function public.delete_setlist_cascade(uuid) to authenticated;

create or replace function public.delete_event_cascade(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_team uuid;
  event_status text;
begin
  select team_id, approval_status
  into event_team, event_status
  from public.events
  where id = p_event_id
  for update;
  if event_team is null
     or not (
       private.has_team_role(event_team, array['owner', 'admin']::public.team_role[])
       or (
         event_status = 'approved'
         and private.has_team_role(
           event_team,
           array['pastor', 'worship_leader']::public.team_role[]
         )
       )
     ) then
    raise exception using errcode = '42501', message = 'event cannot be deleted';
  end if;
  delete from public.setlists where event_id = p_event_id and team_id = event_team;
  delete from public.events where id = p_event_id and team_id = event_team;
end;
$$;

revoke all on function public.delete_event_cascade(uuid) from public, anon;
grant execute on function public.delete_event_cascade(uuid) to authenticated;

create or replace function public.delete_song_cascade(p_song_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  song_team uuid;
begin
  select team_id into song_team
  from public.songs
  where id = p_song_id
  for update;
  if song_team is null
     or not private.has_team_role(
       song_team,
       array['owner', 'admin']::public.team_role[]
     ) then
    raise exception using errcode = '42501', message = 'song cannot be permanently deleted';
  end if;
  delete from public.setlist_songs where song_id = p_song_id;
  delete from public.song_favorites where song_id = p_song_id;
  delete from public.songs where id = p_song_id and team_id = song_team;
end;
$$;

revoke all on function public.delete_song_cascade(uuid) from public, anon;
grant execute on function public.delete_song_cascade(uuid) to authenticated;

create or replace function public.leave_team_workspace(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row public.team_members%rowtype;
begin
  select * into member_row
  from public.team_members
  where team_id = p_team_id
    and profile_id = auth.uid()
    and status = 'active'
  for update;
  if member_row.id is null then
    raise exception using errcode = '42501', message = 'active membership is required';
  end if;
  if member_row.role = 'owner' then
    raise exception using errcode = '42501', message = 'owner must transfer ownership before leaving';
  end if;
  delete from public.team_members where id = member_row.id;
end;
$$;

revoke all on function public.leave_team_workspace(uuid) from public, anon;
grant execute on function public.leave_team_workspace(uuid) to authenticated;

create or replace function public.mark_channel_messages_read(
  p_channel_id uuid,
  p_message_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_count integer := coalesce(cardinality(p_message_ids), 0);
  visible_count integer;
begin
  if requested_count > 500 then
    raise exception using errcode = '22023', message = 'at most 500 messages may be marked read';
  end if;
  if not exists (
    select 1
    from public.message_channel_members cm
    join public.team_members tm on tm.id = cm.team_member_id
    where cm.channel_id = p_channel_id
      and tm.profile_id = auth.uid()
      and tm.status = 'active'
  ) then
    raise exception using errcode = '42501', message = 'channel membership is required';
  end if;

  select count(distinct m.id)
  into visible_count
  from public.messages m
  where m.channel_id = p_channel_id
    and m.id = any(coalesce(p_message_ids, array[]::uuid[]));

  if visible_count <> (
    select count(distinct id) from unnest(coalesce(p_message_ids, array[]::uuid[])) ids(id)
  ) then
    raise exception using errcode = '42501', message = 'message does not belong to the channel';
  end if;

  insert into public.channel_reads (profile_id, channel_id, last_read_at)
  values (auth.uid(), p_channel_id, now())
  on conflict (profile_id, channel_id) do update set last_read_at = excluded.last_read_at;

  insert into public.message_reads (message_id, profile_id, read_at)
  select distinct id, auth.uid(), now()
  from unnest(coalesce(p_message_ids, array[]::uuid[])) ids(id)
  on conflict (message_id, profile_id) do update set read_at = excluded.read_at;

  return visible_count;
end;
$$;

revoke all on function public.mark_channel_messages_read(uuid, uuid[])
  from public, anon;
grant execute on function public.mark_channel_messages_read(uuid, uuid[])
  to authenticated;

-- Direct read-receipt writes must also stay inside a channel the caller can
-- currently access.
drop policy if exists "Users can manage their own channel reads" on public.channel_reads;
create policy "Users can manage reads for their channels"
on public.channel_reads for all to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.message_channel_members cm
    join public.team_members tm on tm.id = cm.team_member_id
    where cm.channel_id = channel_reads.channel_id
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
  )
)
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.message_channel_members cm
    join public.team_members tm on tm.id = cm.team_member_id
    where cm.channel_id = channel_reads.channel_id
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
  )
);

drop policy if exists "Users can manage their own message reads" on public.message_reads;
create policy "Users can manage reads for their messages"
on public.message_reads for all to authenticated
using (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.messages m
    join public.message_channel_members cm on cm.channel_id = m.channel_id
    join public.team_members tm on tm.id = cm.team_member_id
    where m.id = message_reads.message_id
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
  )
)
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1
    from public.messages m
    join public.message_channel_members cm on cm.channel_id = m.channel_id
    join public.team_members tm on tm.id = cm.team_member_id
    where m.id = message_reads.message_id
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
  )
);
