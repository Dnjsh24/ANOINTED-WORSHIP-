-- Candidate SQL Editor bundle for project xvrndwkghxkqsvxxtqym.
-- Requires all earlier repository migrations. Run once, before deploying this website candidate.
-- Local scoped PostgreSQL tests and independent reviews are recorded in tickets.md.
-- Full deployed-schema/migration-history verification remains required.
-- Do not run when any included migration was already applied; use migration tooling to reconcile history first.
-- Manual SQL Editor execution does not register Supabase CLI migration versions.
begin;
-- Source: 20261006010000_atomic_event_setlist_workflows.sql
-- Additive, transaction-owned event and setlist writes. Apply all preceding
-- migrations first. Pending assignments are proposals, never live roster rows.
alter table public.events add column requested_assignments jsonb not null default '[]'::jsonb
  check (jsonb_typeof(requested_assignments) = 'array' and jsonb_array_length(requested_assignments) <= 100);

-- Resolve only this workflow's existing permissions from persisted membership.
-- Review authority deliberately remains owner/admin throughout these RPCs.
create function private.has_workspace_permission(p_team_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_permission
    when 'events.manage' then private.has_team_role(p_team_id, array['owner','admin','pastor','worship_leader']::public.team_role[])
    when 'setlists.manage' then private.has_team_role(p_team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
    else false end or (p_permission in ('events.manage','setlists.manage') and exists (
      select 1 from public.team_members tm join public.custom_roles cr on cr.id = tm.custom_role_id and cr.team_id = tm.team_id
      where tm.team_id = p_team_id and tm.profile_id = auth.uid() and tm.status = 'active' and p_permission = any(cr.permissions)
    ));
$$;
revoke all on function private.has_workspace_permission(uuid, text) from public, anon, authenticated;

-- ponytail: workspace writes lock all existing team members before parents,
-- including members referenced by unchanged/removed child rows. Use a complete
-- old/new reference lock set if larger teams make this scope costly.
create function private.lock_workspace_members(p_team_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  -- Custom-role deletion updates member references, so roles precede members.
  perform 1 from public.custom_roles where team_id=p_team_id order by id for share;
  perform 1 from public.team_members where team_id=p_team_id order by id for share;
  if not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  -- ponytail: serialize this team's checked writes, including new event links.
  -- Use complete per-event old/new reference locks if team write throughput grows.
  perform pg_advisory_xact_lock(hashtextextended('workspace:' || p_team_id::text,0));
end;
$$;
revoke all on function private.lock_workspace_members(uuid) from public, anon;
grant execute on function private.lock_workspace_members(uuid) to authenticated;

create function private.validate_event_assignment_payload(p_team_id uuid, p_assignments jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_assignments is null or jsonb_typeof(p_assignments) <> 'array'
     or jsonb_array_length(p_assignments) > 100 then
    raise exception 'Invalid assignments' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_assignments) item
    where item->>'assignment' is null or item->>'assignment' not in
      ('Worship Leader','Acoustic Guitar','Electric Guitar','Bass','Drums','Main Keys','Second Keys','Band Member','Backup Singer','Media','Dancers')
      or not exists (select 1 from public.team_members tm
        where tm.id = (item->>'team_member_id')::uuid and tm.team_id = p_team_id and tm.status = 'active')
  ) or (select count(*) <> count(distinct (item->>'team_member_id', item->>'assignment'))
        from jsonb_array_elements(p_assignments) item) then
    raise exception 'Assignments require unique roles and active same-team members' using errcode = '22023';
  end if;
  -- Prevent members becoming inactive while this transaction saves assignments.
  perform 1 from public.team_members tm
  where tm.team_id = p_team_id and tm.id in
    (select (item->>'team_member_id')::uuid from jsonb_array_elements(p_assignments) item)
  order by tm.id for share;
  if exists (select 1 from jsonb_array_elements(p_assignments) item
    where not exists (select 1 from public.team_members tm where tm.id = (item->>'team_member_id')::uuid
      and tm.status = 'active' and tm.team_id = p_team_id)) then
    raise exception 'Assignment membership changed; retry' using errcode = '22023';
  end if;
end;
$$;
revoke all on function private.validate_event_assignment_payload(uuid, jsonb) from public, anon, authenticated;

create function public.save_event_workspace(
  p_team_id uuid, p_event_id uuid, p_details jsonb, p_assignments jsonb, p_linked_setlist_id uuid, p_expected_revision bigint default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events%rowtype;
  v_id uuid := coalesce(p_event_id, gen_random_uuid());
  v_approved boolean;
  v_status text;
  v_base_date date := (p_details->>'event_date')::date;
  v_date date;
  v_rehearsal_date date := nullif(p_details->>'rehearsal_date', '')::date;
  v_rule text := coalesce(p_details->>'recurrence_rule', 'none');
  v_occurrences integer := 0;
  v_index integer;
  v_child_id uuid;
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  perform private.lock_workspace_members(p_team_id);
  v_approved := private.has_workspace_permission(p_team_id, 'events.manage');
  -- Member deletion cascades into assignments and then their parent event.
  perform private.validate_event_assignment_payload(p_team_id, p_assignments);
  -- Use the same setlist-before-event lock order as save_setlist_workspace.
  if p_linked_setlist_id is not null then
    perform 1 from public.setlists where id = p_linked_setlist_id and team_id = p_team_id and deleted_at is null for update;
    if not found then raise exception 'Linked setlist is unavailable' using errcode = '42501'; end if;
  end if;
  if p_event_id is not null then
    select * into v_event from public.events where id = p_event_id and team_id = p_team_id and deleted_at is null for update;
    if v_event.id is null or not v_approved or (v_event.approval_status <> 'approved'
      and not private.has_team_role(p_team_id, array['owner','admin']::public.team_role[])) then
      raise exception 'Event cannot be edited' using errcode = '42501';
    end if;
    v_status := v_event.approval_status;
    if p_expected_revision is null or p_expected_revision<>v_event.sync_revision then
      raise exception 'Event changed. Reload before saving; keep your draft.' using errcode='40001';
    end if;
    v_rule := coalesce(v_event.recurrence_rule, 'none');
  else
    v_status := case when v_approved then 'approved' else 'pending' end;
    if v_rule not in ('none','weekly','biweekly','monthly') then
      raise exception 'Invalid recurrence' using errcode = '22023';
    end if;
    v_occurrences := case v_rule when 'weekly' then 12 when 'biweekly' then 6 when 'monthly' then 3 else 0 end;
  end if;
  if jsonb_typeof(p_details) <> 'object' or length(trim(coalesce(p_details->>'name', ''))) not between 1 and 160
    or v_base_date is null or p_details->>'starts_at' is null then
    raise exception 'Invalid event details' using errcode = '22023';
  end if;
  if p_linked_setlist_id is not null then
    if v_status <> 'approved' or not private.has_workspace_permission(p_team_id, 'setlists.manage')
       or not exists (select 1 from public.setlists where id = p_linked_setlist_id and team_id = p_team_id and deleted_at is null) then
      raise exception 'Linked setlist is unavailable' using errcode = '42501';
    end if;
  end if;
  for v_index in 0..v_occurrences loop
    v_child_id := case when v_index = 0 then v_id else gen_random_uuid() end;
    v_date := case v_rule when 'monthly' then (v_base_date + make_interval(months => v_index))::date
      when 'weekly' then v_base_date + 7 * v_index when 'biweekly' then v_base_date + 14 * v_index else v_base_date end;
    if p_event_id is null then
      insert into public.events (id, team_id, name, type, event_date, starts_at, ends_at, location, description,
        rehearsal_date, rehearsal_time, rehearsal_end_time, approval_status, created_by,
        recurrence_rule, recurrence_parent_id, requested_assignments)
      values (v_child_id, p_team_id, p_details->>'name', (p_details->>'type')::public.event_type, v_date,
        (p_details->>'starts_at')::time, nullif(p_details->>'ends_at','')::time, p_details->>'location', p_details->>'description',
        v_rehearsal_date + (v_date - v_base_date), nullif(p_details->>'rehearsal_time','')::time,
        nullif(p_details->>'rehearsal_end_time','')::time, v_status, auth.uid(),
        nullif(v_rule, 'none'), case when v_index > 0 then v_id else null end,
        case when v_status = 'pending' then p_assignments else '[]'::jsonb end);
    else
      update public.events set name = p_details->>'name', type = (p_details->>'type')::public.event_type,
        event_date = v_base_date, starts_at = (p_details->>'starts_at')::time,
        ends_at = nullif(p_details->>'ends_at','')::time, location = p_details->>'location', description = p_details->>'description',
        rehearsal_date = v_rehearsal_date, rehearsal_time = nullif(p_details->>'rehearsal_time','')::time,
        rehearsal_end_time = nullif(p_details->>'rehearsal_end_time','')::time,
        requested_assignments = case when v_status = 'pending' then p_assignments else '[]'::jsonb end
      where id = v_id and team_id = p_team_id;
    end if;
    if v_status = 'approved' then
      -- Retain unchanged assignment IDs, remove stale roles, and add new roles.
      delete from public.event_assignments ea where ea.event_id = v_child_id and not exists
        (select 1 from jsonb_array_elements(p_assignments) item
         where ea.team_member_id = (item->>'team_member_id')::uuid and ea.assignment = item->>'assignment');
      insert into public.event_assignments (event_id, team_member_id, assignment)
      select v_child_id, (item->>'team_member_id')::uuid, item->>'assignment' from jsonb_array_elements(p_assignments) item
      on conflict (event_id, team_member_id, assignment) do nothing;
    end if;
  end loop;
  if p_linked_setlist_id is not null then
    update public.setlists set event_id = v_id where id = p_linked_setlist_id and team_id = p_team_id and deleted_at is null;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_event_workspace(uuid, uuid, jsonb, jsonb, uuid, bigint) from public, anon;
grant execute on function public.save_event_workspace(uuid, uuid, jsonb, jsonb, uuid, bigint) to authenticated;

create function public.review_event_request(p_event_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event public.events%rowtype; v_assignments jsonb;
begin
  select * into v_event from public.events where id = p_event_id and deleted_at is null;
  if auth.uid() is null or v_event.id is null
    or not private.has_team_role(v_event.team_id, array['owner','admin']::public.team_role[]) then
    raise exception 'Only owners and admins can review event requests' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') or p_decision is null or v_event.approval_status <> 'pending' then
    raise exception 'Only pending events can be reviewed' using errcode = '22023';
  end if;
  v_assignments := v_event.requested_assignments;
  perform private.lock_workspace_members(v_event.team_id);
  if not private.has_team_role(v_event.team_id, array['owner','admin']::public.team_role[]) then
    raise exception 'Only owners and admins can review event requests' using errcode = '42501';
  end if;
  if p_decision = 'approved' then
    perform private.validate_event_assignment_payload(v_event.team_id, v_assignments);
  end if;
  select * into v_event from public.events where id = p_event_id and deleted_at is null for update;
  if v_event.id is null or v_event.approval_status <> 'pending' or v_event.requested_assignments is distinct from v_assignments then
    raise exception 'Event request changed; reload before reviewing' using errcode = '40001';
  end if;
  if p_decision = 'approved' then
    insert into public.event_assignments (event_id, team_member_id, assignment)
    select v_event.id, (item->>'team_member_id')::uuid, item->>'assignment'
    from jsonb_array_elements(v_event.requested_assignments) item
    on conflict (event_id, team_member_id, assignment) do nothing;
  end if;
  update public.events set approval_status = p_decision, requested_assignments = '[]'::jsonb where id = v_event.id;
end;
$$;
revoke all on function public.review_event_request(uuid, text) from public, anon;
grant execute on function public.review_event_request(uuid, text) to authenticated;

create function public.save_setlist_workspace(
  p_team_id uuid, p_setlist_id uuid, p_event_id uuid, p_details jsonb, p_song_ids uuid[], p_template_id uuid, p_expected_revision bigint default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_setlist_id, gen_random_uuid());
  v_event_id uuid := p_event_id;
  v_setlist public.setlists%rowtype;
  v_slots jsonb;
  v_slot jsonb;
  v_song_ids uuid[] := coalesce(p_song_ids, '{}'::uuid[]);
  v_existing_ids uuid[];
  v_song_id uuid;
  v_index integer;
  v_offset integer;
  v_template_notes text[] := '{}'::text[];
begin
  if auth.uid() is null or not private.has_workspace_permission(p_team_id, 'setlists.manage') then
    raise exception 'Setlist cannot be saved' using errcode = '42501';
  end if;
  perform private.lock_workspace_members(p_team_id);
  if not private.has_workspace_permission(p_team_id, 'setlists.manage') then
    raise exception 'Setlist cannot be saved' using errcode = '42501';
  end if;
  if p_song_ids is null or cardinality(p_song_ids) > 200 or jsonb_typeof(p_details) <> 'object'
    or length(trim(coalesce(p_details->>'name',''))) not between 1 and 160 then
    raise exception 'Invalid setlist details or songs' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_song_ids) sid where sid is null or not exists
    (select 1 from public.songs s where s.id = sid and s.team_id = p_team_id and s.deleted_at is null)) then
    raise exception 'Songs must belong to the active team' using errcode = '22023';
  end if;
  if nullif(p_details->>'leader_member_id','') is not null then
    perform 1 from public.team_members where id = (p_details->>'leader_member_id')::uuid and team_id = p_team_id and status = 'active' for share;
    if not found then raise exception 'Leader must be an active same-team member' using errcode = '22023'; end if;
  end if;
  if p_setlist_id is not null then
    select * into v_setlist from public.setlists where id = p_setlist_id and team_id = p_team_id and deleted_at is null for update;
    if v_setlist.id is null then raise exception 'Setlist is unavailable' using errcode = '42501'; end if;
    if p_expected_revision is null or p_expected_revision<>v_setlist.sync_revision then
      raise exception 'Setlist changed. Reload before saving; keep your draft.' using errcode='40001';
    end if;
    v_event_id := v_setlist.event_id;
  end if;
  if v_event_id is not null then
    perform 1 from public.events where id = v_event_id and team_id = p_team_id and approval_status = 'approved' and deleted_at is null for update;
    if not found then raise exception 'Associated event is unavailable' using errcode = '42501'; end if;
    -- Setlist managers may link events, but only event managers edit event details.
    if private.has_workspace_permission(p_team_id, 'events.manage') and p_details->>'update_event' is distinct from 'false' then
      if nullif(p_details->>'event_revision','') is null or (p_details->>'event_revision')::bigint <> (select sync_revision from public.events where id=v_event_id) then
        raise exception 'Associated event changed. Reload before saving; keep your draft.' using errcode='40001';
      end if;
      update public.events set name = p_details->>'name', type = (p_details->>'event_type')::public.event_type,
        event_date = (p_details->>'setlist_date')::date, starts_at = (p_details->>'call_time')::time,
        call_time = (p_details->>'call_time')::time, rehearsal_time = (p_details->>'rehearsal_time')::time,
        location = p_details->>'location' where id = v_event_id and team_id = p_team_id;
    end if;
  elsif private.has_workspace_permission(p_team_id, 'events.manage') and p_details->>'update_event' is distinct from 'false' then
    insert into public.events (team_id, name, type, event_date, starts_at, call_time, rehearsal_time, location, created_by)
    values (p_team_id, p_details->>'name', (p_details->>'event_type')::public.event_type,
      (p_details->>'setlist_date')::date, (p_details->>'call_time')::time, (p_details->>'call_time')::time,
      (p_details->>'rehearsal_time')::time, p_details->>'location', auth.uid()) returning id into v_event_id;
  end if;
  if p_setlist_id is null then
    insert into public.setlists (id, team_id, event_id, name, setlist_date, location, call_time, rehearsal_time, service_times, notes, created_by, leader_member_id)
    values (v_id, p_team_id, v_event_id, p_details->>'name', (p_details->>'setlist_date')::date, p_details->>'location',
      (p_details->>'call_time')::time, (p_details->>'rehearsal_time')::time,
      array(select jsonb_array_elements_text(p_details->'service_times')), p_details->>'notes', auth.uid(), nullif(p_details->>'leader_member_id','')::uuid);
    if p_template_id is not null then
      select slots into v_slots from public.setlist_templates where id = p_template_id and team_id = p_team_id;
      if v_slots is null or jsonb_typeof(v_slots) <> 'array' or jsonb_array_length(v_slots) > 200 then
        raise exception 'Template is unavailable' using errcode = '22023';
      end if;
      v_song_ids := '{}'::uuid[];
      for v_slot in select value from jsonb_array_elements(v_slots) loop
        insert into public.songs (team_id, title, artist, original_key, lyrics_chords, created_by)
        values (p_team_id, '[Slot: ' || coalesce(nullif(v_slot->>'label',''), nullif(v_slot->>'tag',''), 'Any') || ']',
          'Template', 'C', '', auth.uid()) returning id into v_song_id;
        v_song_ids := array_append(v_song_ids, v_song_id);
        v_template_notes := array_append(v_template_notes, 'Template Tag: ' || coalesce(nullif(v_slot->>'tag',''), 'none'));
      end loop;
      v_song_ids := v_song_ids || p_song_ids;
    end if;
  else
    update public.setlists set name = p_details->>'name', event_id = v_event_id, setlist_date = (p_details->>'setlist_date')::date,
      location = p_details->>'location', call_time = (p_details->>'call_time')::time,
      rehearsal_time = (p_details->>'rehearsal_time')::time,
      service_times = array(select jsonb_array_elements_text(p_details->'service_times')), notes = p_details->>'notes'
      , leader_member_id = case when p_details ? 'leader_member_id' then nullif(p_details->>'leader_member_id','')::uuid else leader_member_id end
    where id = v_id and team_id = p_team_id;
  end if;
  if cardinality(v_song_ids) > 200 then raise exception 'At most 200 slots can be saved' using errcode = '22023'; end if;
  -- Match repeated songs by occurrence in their previous order. Retained rows
  -- are updated in place, preserving every annotation and referring record.
  with requested as (
    select sid, ordinal, row_number() over (partition by sid order by ordinal) occurrence
    from unnest(v_song_ids) with ordinality r(sid, ordinal)
  ), existing as (
    select id, song_id, row_number() over (partition by song_id order by song_order, id) occurrence
    from public.setlist_songs where setlist_id = v_id
  ) select array_agg(e.id order by r.ordinal) into v_existing_ids
    from requested r left join existing e on e.song_id = r.sid and e.occurrence = r.occurrence;
  select coalesce(max(song_order), 0) + 10000 into v_offset from public.setlist_songs where setlist_id = v_id;
  update public.setlist_songs set song_order = song_order + v_offset where setlist_id = v_id;
  delete from public.setlist_songs where setlist_id = v_id and not (id = any(array_remove(coalesce(v_existing_ids, '{}'::uuid[]), null)));
  for v_index in 1..cardinality(v_song_ids) loop
    if v_existing_ids[v_index] is not null then
      update public.setlist_songs set song_order = v_index where id = v_existing_ids[v_index] and setlist_id = v_id;
    else
      insert into public.setlist_songs (setlist_id, song_id, song_order, assigned_key, notes)
      select v_id, id, v_index, original_key, v_template_notes[v_index]
      from public.songs where id = v_song_ids[v_index] and team_id = p_team_id;
    end if;
  end loop;
  insert into public.setlist_change_log (setlist_id, team_id, changed_by, change_type, summary, snapshot)
  values (v_id, p_team_id, auth.uid(), case when p_setlist_id is null then 'created' else 'updated' end,
    case when p_setlist_id is null then 'Created setlist.' else 'Updated setlist details.' end, p_details);
  return v_id;
end;
$$;
revoke all on function public.save_setlist_workspace(uuid, uuid, uuid, jsonb, uuid[], uuid, bigint) from public, anon;
grant execute on function public.save_setlist_workspace(uuid, uuid, uuid, jsonb, uuid[], uuid, bigint) to authenticated;

-- Raw writes cannot supply the workspace CAS or atomic cascade contract.
revoke insert, update, delete, truncate, references, trigger
  on public.events, public.setlists, public.event_assignments, public.setlist_songs
  from public, anon, authenticated;

create or replace function public.delete_event_cascade(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_status text;
begin
  select team_id into v_team from public.events where id=p_event_id;
  perform private.lock_workspace_members(v_team);
  perform 1 from public.setlists where team_id=v_team and event_id=p_event_id order by id for update;
  select approval_status into v_status from public.events where id=p_event_id and team_id=v_team for update;
  if not found or not private.has_workspace_permission(v_team,'events.manage')
    or (v_status<>'approved' and not private.has_team_role(v_team,array['owner','admin']::public.team_role[])) then
    raise exception 'event cannot be deleted' using errcode='42501';
  end if;
  delete from public.setlists where event_id=p_event_id and team_id=v_team;
  delete from public.events where id=p_event_id and team_id=v_team;
end;
$$;
revoke all on function public.delete_event_cascade(uuid) from public,anon;
grant execute on function public.delete_event_cascade(uuid) to authenticated;
-- Source: 20261006020000_shared_edit_requests_song_ownership.sql
-- Apply after the atomic workspace migration. Existing published content and
-- legacy song requests remain intact; unknown historical revisions require resubmission.
alter table public.announcements add column shared_edit_revision bigint not null default 0;
alter table public.notifications add column shared_edit_revision bigint not null default 0;
alter table public.dance_notes add column shared_edit_revision bigint not null default 0;

create table public.shared_edit_requests (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 target_type text not null check (target_type in ('song','setlist','event','song_slot','announcement','reminder','choreography')),
 target_id uuid not null, base_revision bigint not null check (base_revision between 0 and 9007199254740991), changes jsonb not null,
 before_snapshot jsonb not null, after_snapshot jsonb,
 reason text not null check (length(trim(reason)) between 1 and 1000),
 status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn','needs_revision')),
 requested_by uuid not null references public.profiles(id), reviewed_by uuid references public.profiles(id),
 review_reason text check (length(review_reason) <= 1000), requested_at timestamptz not null default now(), reviewed_at timestamptz,
 request_nonce uuid not null, legacy_song_request_id uuid unique references public.song_edit_requests(id) on delete set null,
 unique (requested_by,request_nonce), check (jsonb_typeof(changes)='object' and octet_length(changes::text) <= 262144),
 check (status not in ('approved','rejected') or (reviewed_by is not null and reviewed_at is not null and reviewed_by <> requested_by))
);
create index shared_edit_requests_team_queue_idx on public.shared_edit_requests(team_id,status,requested_at desc);
create index shared_edit_requests_requester_idx on public.shared_edit_requests(requested_by,requested_at desc);
create index shared_edit_requests_target_idx on public.shared_edit_requests(target_type,target_id);
alter table public.shared_edit_requests enable row level security;
revoke all on public.shared_edit_requests from public,anon,authenticated;
grant select on public.shared_edit_requests to authenticated;

create function private.shared_edit_permission(p_type text) returns text language sql immutable set search_path='' as $$
 select case p_type when 'song' then 'songs.review' when 'setlist' then 'setlists.manage' when 'event' then 'events.manage' when 'song_slot' then 'setlists.manage' when 'announcement' then 'announcements.create' when 'reminder' then 'members.manage' when 'choreography' then 'dance_notes.review' else null end;
$$;
create function private.can_review_shared_edit(p_team uuid,p_type text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_approved_member(p_team) and case when p_type='song' then private.has_team_role(p_team,array['owner','admin']::public.team_role[])
 else private.has_workspace_permission(p_team,private.shared_edit_permission(p_type)) or
 private.has_team_role(p_team,case private.shared_edit_permission(p_type) when 'announcements.create' then array['owner','admin','pastor','worship_leader']::public.team_role[]
 when 'members.manage' then array['owner','admin']::public.team_role[] when 'dance_notes.review' then array['owner','admin']::public.team_role[] else '{}'::public.team_role[] end)
 or exists (select 1 from public.team_members tm join public.custom_roles cr on cr.id=tm.custom_role_id and cr.team_id=tm.team_id
 where tm.team_id=p_team and tm.profile_id=auth.uid() and tm.status='active' and private.shared_edit_permission(p_type)=any(cr.permissions)) end;
$$;
create function private.can_read_shared_target(p_type text,p_id uuid,p_team uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_approved_member(p_team) then return false; end if;
 if p_type='announcement' then return exists(select 1 from public.announcements a where a.id=p_id and a.team_id=p_team and (
 (a.target_role is null and a.target_profile_id is null) or a.target_profile_id=auth.uid() or private.can_review_shared_edit(p_team,p_type)
 or exists(select 1 from public.team_members tm where tm.team_id=p_team and tm.profile_id=auth.uid() and tm.status='active' and tm.role=a.target_role)));
 elsif p_type='reminder' then return exists(select 1 from public.notifications n where n.notice_group_id=p_id and n.team_id=p_team
 and (n.profile_id=auth.uid() or private.can_review_shared_edit(p_team,p_type)))
 and not exists(select 1 from public.notifications n where n.notice_group_id=p_id and n.team_id<>p_team);
 end if;
 return p_type in ('song','setlist','event','song_slot','choreography');
end;
$$;
revoke all on function private.shared_edit_permission(text),private.can_review_shared_edit(uuid,text),private.can_read_shared_target(text,uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_review_shared_edit(uuid,text),private.can_read_shared_target(text,uuid,uuid) to authenticated;
create policy "Actor and eligible reviewer can read bounded shared requests" on public.shared_edit_requests for select to authenticated using (
 private.can_read_shared_target(target_type,target_id,team_id) and (requested_by=auth.uid() or private.can_review_shared_edit(team_id,target_type))
);

create function private.validate_shared_edit_changes(p_type text,p_changes jsonb) returns void language plpgsql set search_path='' as $$
declare v_keys text[]; v_item jsonb; v_key text;
begin
 if p_changes is null or jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb or octet_length(p_changes::text)>262144 then raise exception 'Invalid proposal' using errcode='22023'; end if;
 v_keys := case p_type when 'song' then array['title','artist','original_key','bpm','time_signature','lyrics_chords','youtube_url','spotify_url','image_url','album','tags']::text[]
 when 'setlist' then array['name','setlist_date','location','call_time','rehearsal_time','service_times','notes','leader_member_id','song_ids']::text[]
 when 'event' then array['name','type','event_date','starts_at','ends_at','location','description','rehearsal_date','rehearsal_time','rehearsal_end_time','assignments']::text[]
 when 'song_slot' then array['notes','band_notes','arrangement','assigned_key','lead_member_id','youtube_url']::text[]
 when 'announcement' then array['title','body','category','priority','is_pinned']::text[]
 when 'reminder' then array['title','body','priority']::text[]
 when 'choreography' then array['title','choreography_notes','formation_notes','outfit_notes','song_title','song_artist','song_version','video_url']::text[] else null end;
 if v_keys is null or exists(select 1 from jsonb_object_keys(p_changes) key where not(key=any(v_keys))) then raise exception 'Unsupported proposal fields' using errcode='22023'; end if;
 case p_type
 when 'song' then
  if p_changes ? 'title'  and (jsonb_typeof(p_changes->'title')<>'string' or length(p_changes->>'title')>160 or length(trim(p_changes->>'title'))=0) then raise exception 'Invalid title' using errcode='22023'; end if;
  if p_changes ? 'artist'  and (jsonb_typeof(p_changes->'artist')<>'string' or length(p_changes->>'artist')>160 or length(trim(p_changes->>'artist'))=0) then raise exception 'Invalid artist' using errcode='22023'; end if;
  if p_changes ? 'original_key'  and (jsonb_typeof(p_changes->'original_key')<>'string' or length(p_changes->>'original_key')>3 or length(trim(p_changes->>'original_key'))=0) then raise exception 'Invalid original_key' using errcode='22023'; end if;
  if p_changes ? 'bpm' and p_changes->'bpm'<>'null'::jsonb and (jsonb_typeof(p_changes->'bpm')<>'number' or (p_changes->>'bpm')::numeric not between 40 and 240 or (p_changes->>'bpm')::numeric<>trunc((p_changes->>'bpm')::numeric)) then raise exception 'Invalid bpm' using errcode='22023'; end if;
  if p_changes ? 'time_signature'  and (jsonb_typeof(p_changes->'time_signature')<>'string' or length(p_changes->>'time_signature')>5) then raise exception 'Invalid time_signature' using errcode='22023'; end if;
  if p_changes ? 'lyrics_chords'  and (jsonb_typeof(p_changes->'lyrics_chords')<>'string' or length(p_changes->>'lyrics_chords')>20000 or length(trim(p_changes->>'lyrics_chords'))=0) then raise exception 'Invalid lyrics_chords' using errcode='22023'; end if;
  if p_changes ? 'youtube_url' and p_changes->'youtube_url'<>'null'::jsonb and (jsonb_typeof(p_changes->'youtube_url')<>'string' or length(p_changes->>'youtube_url')>500) then raise exception 'Invalid youtube_url' using errcode='22023'; end if;
  if p_changes ? 'spotify_url' and p_changes->'spotify_url'<>'null'::jsonb and (jsonb_typeof(p_changes->'spotify_url')<>'string' or length(p_changes->>'spotify_url')>500) then raise exception 'Invalid spotify_url' using errcode='22023'; end if;
  if p_changes ? 'image_url' and p_changes->'image_url'<>'null'::jsonb and (jsonb_typeof(p_changes->'image_url')<>'string' or length(p_changes->>'image_url')>500) then raise exception 'Invalid image_url' using errcode='22023'; end if;
  if p_changes ? 'album' and p_changes->'album'<>'null'::jsonb and (jsonb_typeof(p_changes->'album')<>'string' or length(p_changes->>'album')>160) then raise exception 'Invalid album' using errcode='22023'; end if;
  if p_changes ? 'tags'  and (jsonb_typeof(p_changes->'tags')<>'array' or jsonb_array_length(p_changes->'tags')>30) then raise exception 'Invalid tags' using errcode='22023'; end if;
 when 'setlist' then
  if p_changes ? 'name'  and (jsonb_typeof(p_changes->'name')<>'string' or length(p_changes->>'name')>160 or length(trim(p_changes->>'name'))=0) then raise exception 'Invalid name' using errcode='22023'; end if;
  if p_changes ? 'setlist_date'  and (jsonb_typeof(p_changes->'setlist_date')<>'string' or p_changes->>'setlist_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid setlist_date' using errcode='22023'; end if;
  if p_changes ? 'location' and p_changes->'location'<>'null'::jsonb and (jsonb_typeof(p_changes->'location')<>'string' or length(p_changes->>'location')>160) then raise exception 'Invalid location' using errcode='22023'; end if;
  if p_changes ? 'call_time' and p_changes->'call_time'<>'null'::jsonb and (jsonb_typeof(p_changes->'call_time')<>'string' or p_changes->>'call_time'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid call_time' using errcode='22023'; end if;
  if p_changes ? 'rehearsal_time' and p_changes->'rehearsal_time'<>'null'::jsonb and (jsonb_typeof(p_changes->'rehearsal_time')<>'string' or p_changes->>'rehearsal_time'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid rehearsal_time' using errcode='22023'; end if;
  if p_changes ? 'service_times'  and (jsonb_typeof(p_changes->'service_times')<>'array' or jsonb_array_length(p_changes->'service_times')>20) then raise exception 'Invalid service_times' using errcode='22023'; end if;
  if p_changes ? 'notes' and p_changes->'notes'<>'null'::jsonb and (jsonb_typeof(p_changes->'notes')<>'string' or length(p_changes->>'notes')>2000) then raise exception 'Invalid notes' using errcode='22023'; end if;
  if p_changes ? 'leader_member_id' and p_changes->'leader_member_id'<>'null'::jsonb and (jsonb_typeof(p_changes->'leader_member_id')<>'string' or p_changes->>'leader_member_id'!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then raise exception 'Invalid leader_member_id' using errcode='22023'; end if;
  if p_changes ? 'song_ids'  and (jsonb_typeof(p_changes->'song_ids')<>'array' or jsonb_array_length(p_changes->'song_ids')>200) then raise exception 'Invalid song_ids' using errcode='22023'; end if;
 when 'event' then
  if p_changes ? 'name'  and (jsonb_typeof(p_changes->'name')<>'string' or length(p_changes->>'name')>160 or length(trim(p_changes->>'name'))=0) then raise exception 'Invalid name' using errcode='22023'; end if;
  if p_changes ? 'type'  and (jsonb_typeof(p_changes->'type')<>'string' or length(p_changes->>'type')>30) then raise exception 'Invalid type' using errcode='22023'; end if;
  if p_changes ? 'event_date'  and (jsonb_typeof(p_changes->'event_date')<>'string' or p_changes->>'event_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid event_date' using errcode='22023'; end if;
  if p_changes ? 'starts_at'  and (jsonb_typeof(p_changes->'starts_at')<>'string' or p_changes->>'starts_at'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid starts_at' using errcode='22023'; end if;
  if p_changes ? 'ends_at' and p_changes->'ends_at'<>'null'::jsonb and (jsonb_typeof(p_changes->'ends_at')<>'string' or p_changes->>'ends_at'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid ends_at' using errcode='22023'; end if;
  if p_changes ? 'location' and p_changes->'location'<>'null'::jsonb and (jsonb_typeof(p_changes->'location')<>'string' or length(p_changes->>'location')>160) then raise exception 'Invalid location' using errcode='22023'; end if;
  if p_changes ? 'description' and p_changes->'description'<>'null'::jsonb and (jsonb_typeof(p_changes->'description')<>'string' or length(p_changes->>'description')>2000) then raise exception 'Invalid description' using errcode='22023'; end if;
  if p_changes ? 'rehearsal_date' and p_changes->'rehearsal_date'<>'null'::jsonb and (jsonb_typeof(p_changes->'rehearsal_date')<>'string' or p_changes->>'rehearsal_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then raise exception 'Invalid rehearsal_date' using errcode='22023'; end if;
  if p_changes ? 'rehearsal_time' and p_changes->'rehearsal_time'<>'null'::jsonb and (jsonb_typeof(p_changes->'rehearsal_time')<>'string' or p_changes->>'rehearsal_time'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid rehearsal_time' using errcode='22023'; end if;
  if p_changes ? 'rehearsal_end_time' and p_changes->'rehearsal_end_time'<>'null'::jsonb and (jsonb_typeof(p_changes->'rehearsal_end_time')<>'string' or p_changes->>'rehearsal_end_time'!~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') then raise exception 'Invalid rehearsal_end_time' using errcode='22023'; end if;
  if p_changes ? 'assignments'  and (jsonb_typeof(p_changes->'assignments')<>'array' or jsonb_array_length(p_changes->'assignments')>100) then raise exception 'Invalid assignments' using errcode='22023'; end if;
  if p_changes ? 'assignments' then
   for v_item in select value from jsonb_array_elements(p_changes->'assignments') loop
    if jsonb_typeof(v_item)<>'object' or v_item-array['team_member_id','assignment']<>'{}'::jsonb
     or coalesce(jsonb_typeof(v_item->'team_member_id'),'')<>'string'
     or coalesce(jsonb_typeof(v_item->'assignment'),'')<>'string' or v_item->>'assignment' not in ('Worship Leader','Acoustic Guitar','Electric Guitar','Bass','Drums','Main Keys','Second Keys','Band Member','Backup Singer','Media','Dancers') then raise exception 'Invalid assignment proposal' using errcode='22023'; end if;
    perform (v_item->>'team_member_id')::uuid;
   end loop;
   if (select count(*)<>count(distinct (a->>'team_member_id',a->>'assignment')) from jsonb_array_elements(p_changes->'assignments') a) then raise exception 'Duplicate assignment' using errcode='22023'; end if;
  end if;
 when 'song_slot' then
  if p_changes ? 'notes' and p_changes->'notes'<>'null'::jsonb and (jsonb_typeof(p_changes->'notes')<>'string' or length(p_changes->>'notes')>2000) then raise exception 'Invalid notes' using errcode='22023'; end if;
  if p_changes ? 'band_notes' and p_changes->'band_notes'<>'null'::jsonb and (jsonb_typeof(p_changes->'band_notes')<>'string' or length(p_changes->>'band_notes')>4000) then raise exception 'Invalid band_notes' using errcode='22023'; end if;
  if p_changes ? 'arrangement' and p_changes->'arrangement'<>'null'::jsonb and (jsonb_typeof(p_changes->'arrangement')<>'string' or length(p_changes->>'arrangement')>4000) then raise exception 'Invalid arrangement' using errcode='22023'; end if;
  if p_changes ? 'assigned_key'  and (jsonb_typeof(p_changes->'assigned_key')<>'string' or length(p_changes->>'assigned_key')>3 or length(trim(p_changes->>'assigned_key'))=0) then raise exception 'Invalid assigned_key' using errcode='22023'; end if;
  if p_changes ? 'lead_member_id' and p_changes->'lead_member_id'<>'null'::jsonb and (jsonb_typeof(p_changes->'lead_member_id')<>'string' or p_changes->>'lead_member_id'!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then raise exception 'Invalid lead_member_id' using errcode='22023'; end if;
  if p_changes ? 'youtube_url' and p_changes->'youtube_url'<>'null'::jsonb and (jsonb_typeof(p_changes->'youtube_url')<>'string' or length(p_changes->>'youtube_url')>500) then raise exception 'Invalid youtube_url' using errcode='22023'; end if;
 when 'announcement' then
  if p_changes ? 'title'  and (jsonb_typeof(p_changes->'title')<>'string' or length(p_changes->>'title')>160 or length(trim(p_changes->>'title'))=0) then raise exception 'Invalid title' using errcode='22023'; end if;
  if p_changes ? 'body'  and (jsonb_typeof(p_changes->'body')<>'string' or length(p_changes->>'body')>3000 or length(trim(p_changes->>'body'))=0) then raise exception 'Invalid body' using errcode='22023'; end if;
  if p_changes ? 'category'  and (jsonb_typeof(p_changes->'category')<>'string' or length(p_changes->>'category')>80 or length(trim(p_changes->>'category'))=0) then raise exception 'Invalid category' using errcode='22023'; end if;
  if p_changes ? 'priority'  and (jsonb_typeof(p_changes->'priority')<>'string' or length(p_changes->>'priority')>10) then raise exception 'Invalid priority' using errcode='22023'; end if;
  if p_changes ? 'is_pinned'  and (jsonb_typeof(p_changes->'is_pinned')<>'boolean') then raise exception 'Invalid is_pinned' using errcode='22023'; end if;
 when 'reminder' then
  if p_changes ? 'title'  and (jsonb_typeof(p_changes->'title')<>'string' or length(p_changes->>'title')>160 or length(trim(p_changes->>'title'))=0) then raise exception 'Invalid title' using errcode='22023'; end if;
  if p_changes ? 'body' and p_changes->'body'<>'null'::jsonb and (jsonb_typeof(p_changes->'body')<>'string' or length(p_changes->>'body')>2000) then raise exception 'Invalid body' using errcode='22023'; end if;
  if p_changes ? 'priority'  and (jsonb_typeof(p_changes->'priority')<>'string' or length(p_changes->>'priority')>10) then raise exception 'Invalid priority' using errcode='22023'; end if;
 when 'choreography' then
  if p_changes ? 'title'  and (jsonb_typeof(p_changes->'title')<>'string' or length(p_changes->>'title')>160 or length(trim(p_changes->>'title'))=0) then raise exception 'Invalid title' using errcode='22023'; end if;
  if p_changes ? 'choreography_notes'  and (jsonb_typeof(p_changes->'choreography_notes')<>'string' or length(p_changes->>'choreography_notes')>6000 or length(trim(p_changes->>'choreography_notes'))=0) then raise exception 'Invalid choreography_notes' using errcode='22023'; end if;
  if p_changes ? 'formation_notes' and p_changes->'formation_notes'<>'null'::jsonb and (jsonb_typeof(p_changes->'formation_notes')<>'string' or length(p_changes->>'formation_notes')>3000) then raise exception 'Invalid formation_notes' using errcode='22023'; end if;
  if p_changes ? 'outfit_notes' and p_changes->'outfit_notes'<>'null'::jsonb and (jsonb_typeof(p_changes->'outfit_notes')<>'string' or length(p_changes->>'outfit_notes')>2000) then raise exception 'Invalid outfit_notes' using errcode='22023'; end if;
  if p_changes ? 'song_title' and p_changes->'song_title'<>'null'::jsonb and (jsonb_typeof(p_changes->'song_title')<>'string' or length(p_changes->>'song_title')>160) then raise exception 'Invalid song_title' using errcode='22023'; end if;
  if p_changes ? 'song_artist' and p_changes->'song_artist'<>'null'::jsonb and (jsonb_typeof(p_changes->'song_artist')<>'string' or length(p_changes->>'song_artist')>160) then raise exception 'Invalid song_artist' using errcode='22023'; end if;
  if p_changes ? 'song_version' and p_changes->'song_version'<>'null'::jsonb and (jsonb_typeof(p_changes->'song_version')<>'string' or length(p_changes->>'song_version')>160) then raise exception 'Invalid song_version' using errcode='22023'; end if;
  if p_changes ? 'video_url' and p_changes->'video_url'<>'null'::jsonb and (jsonb_typeof(p_changes->'video_url')<>'string' or length(p_changes->>'video_url')>500) then raise exception 'Invalid video_url' using errcode='22023'; end if;
 else raise exception 'Unsupported proposal type' using errcode='22023'; end case;
 if p_changes ? 'priority' and p_changes->>'priority' not in ('normal','important','urgent') then raise exception 'Invalid priority' using errcode='22023'; end if;
 if p_type='song' and p_changes ? 'time_signature' and p_changes->>'time_signature' !~ '^[0-9]{1,2}/[0-9]{1,2}$' then raise exception 'Invalid time signature' using errcode='22023'; end if;
 if p_type='event' and p_changes ? 'type' and p_changes->>'type' not in ('service','rehearsal','meeting','special_event','service_rehearsal') then raise exception 'Invalid event type' using errcode='22023'; end if;
 foreach v_key in array array['tags','service_times','song_ids'] loop
  if p_changes ? v_key then
   for v_item in select value from jsonb_array_elements(p_changes->v_key) loop
    if jsonb_typeof(v_item)<>'string' or (v_key<>'song_ids' and length(v_item#>>'{}')>80)
     or (v_key='tags' and length(trim(v_item#>>'{}'))=0)
     or (v_key='song_ids' and v_item#>>'{}' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') then raise exception 'Invalid array item' using errcode='22023'; end if;
   end loop;
  end if;
 end loop;
 foreach v_key in array array['setlist_date','event_date','rehearsal_date'] loop
  if p_changes ? v_key and p_changes->v_key<>'null'::jsonb then perform (p_changes->>v_key)::date; end if;
 end loop;
end;
$$;
revoke all on function private.validate_shared_edit_changes(text,jsonb) from public,anon,authenticated;

create function private.shared_edit_target(p_type text,p_id uuid,p_lock boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row jsonb; v_team uuid; v_revision bigint; v_values jsonb;
begin
 case p_type
 when 'song' then

  if p_lock then perform 1 from public.songs where id=p_id for update; end if;
  select to_jsonb(t),t.sync_revision into v_row,v_revision from public.songs t where t.id=p_id and t.deleted_at is null and t.status='approved';
 when 'setlist' then

  if p_lock then perform 1 from public.setlists where id=p_id for update; end if;
  select to_jsonb(t),t.sync_revision into v_row,v_revision from public.setlists t where t.id=p_id and t.deleted_at is null ;
 when 'event' then

  if p_lock then perform 1 from public.events where id=p_id for update; end if;
  select to_jsonb(t),t.sync_revision into v_row,v_revision from public.events t where t.id=p_id and t.deleted_at is null and t.approval_status='approved';
 when 'song_slot' then
  if p_lock then perform 1 from public.setlists sl join public.setlist_songs ss on ss.setlist_id=sl.id where ss.id=p_id for update of sl; end if;
  if p_lock then perform 1 from public.setlist_songs where id=p_id for update; end if;
  select to_jsonb(t),t.sync_revision into v_row,v_revision from public.setlist_songs t where t.id=p_id and t.deleted_at is null ;
 when 'announcement' then

  if p_lock then perform 1 from public.announcements where id=p_id for update; end if;
  select to_jsonb(t),t.shared_edit_revision into v_row,v_revision from public.announcements t where t.id=p_id  ;
 when 'reminder' then
  if p_lock then perform 1 from public.notifications where notice_group_id=p_id order by id for update; end if;
  select to_jsonb(n), (select sum(shared_edit_revision) from public.notifications where notice_group_id=p_id) into v_row,v_revision from public.notifications n where n.notice_group_id=p_id order by n.id limit 1;
 when 'choreography' then

  if p_lock then perform 1 from public.dance_notes where id=p_id for update; end if;
  select to_jsonb(t),t.shared_edit_revision into v_row,v_revision from public.dance_notes t where t.id=p_id  ;
 else raise exception 'Unsupported proposal type' using errcode='22023'; end case;
 if v_row is null then raise exception 'Target is unavailable' using errcode='42501'; end if;
 if p_type='song_slot' then select team_id into v_team from public.setlists where id=(v_row->>'setlist_id')::uuid and deleted_at is null;
 else v_team:=(v_row->>'team_id')::uuid; end if;
 if auth.uid() is null or v_team is null or not private.can_read_shared_target(p_type,p_id,v_team) then raise exception 'Target is unavailable' using errcode='42501'; end if;
 v_values:='{}'::jsonb;
 case p_type
 when 'song' then v_values:=jsonb_build_object('title',v_row->'title','artist',v_row->'artist','original_key',v_row->'original_key','bpm',v_row->'bpm','time_signature',v_row->'time_signature','lyrics_chords',v_row->'lyrics_chords','youtube_url',v_row->'youtube_url','spotify_url',v_row->'spotify_url','image_url',v_row->'image_url','album',v_row->'album','tags',v_row->'tags');
 when 'setlist' then v_values:=jsonb_build_object('name',v_row->'name','setlist_date',v_row->'setlist_date','location',v_row->'location','call_time',v_row->'call_time','rehearsal_time',v_row->'rehearsal_time','service_times',v_row->'service_times','notes',v_row->'notes','leader_member_id',v_row->'leader_member_id');
 v_values:=v_values || jsonb_build_object('song_ids',coalesce((select jsonb_agg(song_id order by song_order) from public.setlist_songs where setlist_id=p_id and deleted_at is null),'[]'::jsonb));
 when 'event' then v_values:=jsonb_build_object('name',v_row->'name','type',v_row->'type','event_date',v_row->'event_date','starts_at',v_row->'starts_at','ends_at',v_row->'ends_at','location',v_row->'location','description',v_row->'description','rehearsal_date',v_row->'rehearsal_date','rehearsal_time',v_row->'rehearsal_time','rehearsal_end_time',v_row->'rehearsal_end_time');
 v_values:=v_values || jsonb_build_object('assignments',coalesce((select jsonb_agg(jsonb_build_object('team_member_id',team_member_id,'assignment',assignment) order by assignment,team_member_id) from public.event_assignments where event_id=p_id),'[]'::jsonb));
 when 'song_slot' then v_values:=jsonb_build_object('notes',v_row->'notes','band_notes',v_row->'band_notes','arrangement',v_row->'arrangement','assigned_key',v_row->'assigned_key','lead_member_id',v_row->'lead_member_id','youtube_url',v_row->'youtube_url');
 when 'announcement' then v_values:=jsonb_build_object('title',v_row->'title','body',v_row->'body','category',v_row->'category','priority',v_row->'priority','is_pinned',v_row->'is_pinned');
 when 'reminder' then v_values:=jsonb_build_object('title',v_row->'title','body',v_row->'body','priority',v_row->'priority');
 when 'choreography' then v_values:=jsonb_build_object('title',v_row->'title','choreography_notes',v_row->'choreography_notes','formation_notes',v_row->'formation_notes','outfit_notes',v_row->'outfit_notes','song_title',v_row->'song_title','song_artist',v_row->'song_artist','song_version',v_row->'song_version','video_url',v_row->'video_url');
 else null; end case;
 return jsonb_build_object('team_id',v_team,'revision',v_revision,'values',v_values);
end;
$$;
revoke all on function private.shared_edit_target(text,uuid,boolean) from public,anon,authenticated;

create function private.apply_shared_edit(p_type text,p_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_setlist public.setlists%rowtype; v_event public.events%rowtype;
begin
 case p_type
 when 'setlist' then
  select * into v_setlist from public.setlists where id=p_id;
  perform public.save_setlist_workspace(v_setlist.team_id,p_id,null,p_values || jsonb_build_object('update_event',false,'event_type',coalesce((select type::text from public.events where id=v_setlist.event_id),'service')),
    array(select jsonb_array_elements_text(p_values->'song_ids')::uuid),null,v_setlist.sync_revision);
 when 'event' then
  select * into v_event from public.events where id=p_id;
  perform public.save_event_workspace(v_event.team_id,p_id,p_values,p_values->'assignments',null,v_event.sync_revision);
 when 'song' then

 update public.songs t set title=r.title,artist=r.artist,original_key=r.original_key,bpm=r.bpm,time_signature=r.time_signature,lyrics_chords=r.lyrics_chords,youtube_url=r.youtube_url,spotify_url=r.spotify_url,image_url=r.image_url,album=r.album,tags=r.tags from jsonb_populate_record(null::public.songs,p_values) r where t.id=p_id;
 when 'song_slot' then
 select sl.team_id into v_team from public.setlist_songs ss join public.setlists sl on sl.id=ss.setlist_id where ss.id=p_id; if p_values->>'lead_member_id' is not null then perform private.validate_event_assignment_payload(v_team,jsonb_build_array(jsonb_build_object('team_member_id',p_values->>'lead_member_id','assignment','Worship Leader'))); end if;
 update public.setlist_songs t set notes=r.notes,band_notes=r.band_notes,arrangement=r.arrangement,assigned_key=r.assigned_key,lead_member_id=r.lead_member_id,youtube_url=r.youtube_url from jsonb_populate_record(null::public.setlist_songs,p_values) r where t.id=p_id;
 when 'announcement' then

 update public.announcements t set title=r.title,body=r.body,category=r.category,priority=r.priority,is_pinned=r.is_pinned from jsonb_populate_record(null::public.announcements,p_values) r where t.id=p_id;
 when 'reminder' then
  select team_id into v_team from public.notifications where notice_group_id=p_id order by id limit 1;
  update public.notifications t set title=r.title,body=r.body,priority=r.priority from jsonb_populate_record(null::public.notifications,p_values) r where t.notice_group_id=p_id and t.team_id=v_team;
 when 'choreography' then

 update public.dance_notes t set title=r.title,choreography_notes=r.choreography_notes,formation_notes=r.formation_notes,outfit_notes=r.outfit_notes,song_title=r.song_title,song_artist=r.song_artist,song_version=r.song_version,video_url=r.video_url from jsonb_populate_record(null::public.dance_notes,p_values) r where t.id=p_id;
 else raise exception 'Unsupported proposal type' using errcode='22023'; end case;
end;
$$;
revoke all on function private.apply_shared_edit(text,uuid,jsonb) from public,anon,authenticated;

create function public.submit_shared_edit_request(p_target_type text,p_target_id uuid,p_revision bigint,p_changes jsonb,p_reason text,p_request_nonce uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_target jsonb; v_existing public.shared_edit_requests%rowtype; v_id uuid; v_team uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_request_nonce is null or p_revision is null or p_revision not between 0 and 9007199254740991 or length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Invalid request' using errcode='22023'; end if;
 perform private.validate_shared_edit_changes(p_target_type,p_changes);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_request_nonce::text,0));
 select * into v_existing from public.shared_edit_requests where requested_by=auth.uid() and request_nonce=p_request_nonce;
 if v_existing.id is not null then
  if v_existing.target_type<>p_target_type or v_existing.target_id<>p_target_id or v_existing.base_revision<>p_revision or v_existing.changes<>p_changes or v_existing.reason<>trim(p_reason) then raise exception 'Request nonce was already used' using errcode='22023'; end if;
  if not private.can_read_shared_target(p_target_type,p_target_id,v_existing.team_id) then raise exception 'Target is unavailable' using errcode='42501'; end if;
  return v_existing.id;
 end if;
 v_target:=private.shared_edit_target(p_target_type,p_target_id,true); v_team:=(v_target->>'team_id')::uuid;
 insert into public.shared_edit_requests(team_id,target_type,target_id,base_revision,changes,before_snapshot,reason,requested_by,request_nonce,status)
 values(v_team,p_target_type,p_target_id,p_revision,p_changes,v_target->'values',trim(p_reason),auth.uid(),p_request_nonce,
 case when (v_target->>'revision')::bigint=p_revision then 'pending' else 'needs_revision' end) returning id into v_id;
 insert into public.notifications(team_id,profile_id,title,body,target_path,created_by)
 select v_team,tm.profile_id,'Shared edit request','A member submitted a shared-content proposal.','/requests',auth.uid()
 from public.team_members tm where tm.team_id=v_team and tm.status='active' and tm.profile_id<>auth.uid()
 and case when p_target_type='song' then tm.role in ('owner','admin')
 else tm.role in ('owner','admin') or tm.role in (case private.shared_edit_permission(p_target_type)
 when 'events.manage' then 'pastor'::public.team_role when 'announcements.create' then 'pastor'::public.team_role else 'owner'::public.team_role end,
 case private.shared_edit_permission(p_target_type) when 'events.manage' then 'worship_leader'::public.team_role when 'setlists.manage' then 'worship_leader'::public.team_role when 'announcements.create' then 'worship_leader'::public.team_role else 'owner'::public.team_role end,
 case private.shared_edit_permission(p_target_type) when 'setlists.manage' then 'band_leader'::public.team_role else 'owner'::public.team_role end)
 or exists(select 1 from public.custom_roles cr where cr.id=tm.custom_role_id and cr.team_id=tm.team_id and private.shared_edit_permission(p_target_type)=any(cr.permissions)) end;
 return v_id;
end;
$$;
revoke all on function public.submit_shared_edit_request(text,uuid,bigint,jsonb,text,uuid) from public,anon;
grant execute on function public.submit_shared_edit_request(text,uuid,bigint,jsonb,text,uuid) to authenticated;

create function public.review_shared_edit_request(p_request_id uuid,p_decision text,p_reason text default '')
returns text language plpgsql security definer set search_path='' as $$
declare v_request public.shared_edit_requests%rowtype; v_target jsonb; v_after jsonb; v_status text;
begin
 select * into v_request from public.shared_edit_requests where id=p_request_id for update;
 if auth.uid() is null or v_request.id is null or v_request.requested_by=auth.uid() or not private.can_review_shared_edit(v_request.team_id,v_request.target_type)
 or not private.can_read_shared_target(v_request.target_type,v_request.target_id,v_request.team_id) then raise exception 'Reviewer is unavailable or cannot review their own request' using errcode='42501'; end if;
 if v_request.status<>'pending' or p_decision not in ('approved','rejected') or p_decision is null or length(coalesce(p_reason,''))>1000 then raise exception 'Request cannot be reviewed' using errcode='22023'; end if;
 if p_decision='rejected' and length(trim(coalesce(p_reason,'')))=0 then raise exception 'Rejection reason is required' using errcode='22023'; end if;
 if p_decision='approved' then
  perform private.lock_workspace_members(v_request.team_id);
  if not private.can_review_shared_edit(v_request.team_id,v_request.target_type)
    or not private.can_read_shared_target(v_request.target_type,v_request.target_id,v_request.team_id) then
    raise exception 'Reviewer is unavailable or cannot review their own request' using errcode='42501';
  end if;
  begin v_target:=private.shared_edit_target(v_request.target_type,v_request.target_id,true);
  exception when insufficient_privilege then v_target:=null; end;
  if v_target is null or (v_target->>'team_id')::uuid<>v_request.team_id or (v_target->>'revision')::bigint<>v_request.base_revision then
   v_status:='needs_revision';
  else
   perform private.validate_shared_edit_changes(v_request.target_type,v_request.changes);
   perform private.apply_shared_edit(v_request.target_type,v_request.target_id,(v_target->'values') || v_request.changes);
   v_after:=private.shared_edit_target(v_request.target_type,v_request.target_id,false)->'values'; v_status:='approved';
  end if;
 else v_status:='rejected'; end if;
 update public.shared_edit_requests set status=v_status,reviewed_by=auth.uid(),review_reason=case when v_status='needs_revision' then 'Published content changed; revise and resubmit.' else trim(coalesce(p_reason,'')) end,
 reviewed_at=clock_timestamp(),after_snapshot=v_after where id=v_request.id;
 if v_request.legacy_song_request_id is not null and v_status in ('approved','rejected') then
  update public.song_edit_requests set status=v_status::public.song_edit_status,reviewed_by=auth.uid(),reviewed_at=clock_timestamp() where id=v_request.legacy_song_request_id;
 end if;
 insert into public.notifications(team_id,profile_id,title,body,target_path,created_by)
 values(v_request.team_id,v_request.requested_by,'Shared edit request updated','Your request is ' || replace(v_status,'_',' ') || '.','/requests',auth.uid());
 return v_status;
end;
$$;
revoke all on function public.review_shared_edit_request(uuid,text,text) from public,anon;
grant execute on function public.review_shared_edit_request(uuid,text,text) to authenticated;

create function public.withdraw_shared_edit_request(p_request_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_request public.shared_edit_requests%rowtype;
begin
 select * into v_request from public.shared_edit_requests where id=p_request_id for update;
 if auth.uid() is null or v_request.requested_by is distinct from auth.uid() or not private.is_approved_member(v_request.team_id) then raise exception 'Only the active requester can withdraw' using errcode='42501'; end if;
 if v_request.status not in ('pending','needs_revision') then raise exception 'Request cannot be withdrawn' using errcode='22023'; end if;
 update public.shared_edit_requests set status='withdrawn' where id=p_request_id;
end;
$$;
revoke all on function public.withdraw_shared_edit_request(uuid) from public,anon;
grant execute on function public.withdraw_shared_edit_request(uuid) to authenticated;

-- Replace all permissive INSERT/UPDATE paths; SELECT and DELETE stay unchanged.
do $$ declare v_policy record; begin
 for v_policy in select policyname from pg_policies where schemaname='public' and tablename='songs' and cmd in ('INSERT','UPDATE','ALL') loop
  execute format('drop policy %I on public.songs',v_policy.policyname);
 end loop;
end $$;
create policy "Active members add songs with immutable identity" on public.songs for insert to authenticated
 with check(private.is_approved_member(team_id) and created_by=auth.uid() and status='approved' and deleted_at is null);
create policy "Creators and owners admins edit songs" on public.songs for update to authenticated
 using(private.is_approved_member(team_id) and (created_by=auth.uid() or private.has_team_role(team_id,array['owner','admin']::public.team_role[]))
 or private.has_team_role(team_id,array['worship_leader']::public.team_role[]))
 with check(private.is_approved_member(team_id) and (created_by=auth.uid() or private.has_team_role(team_id,array['owner','admin']::public.team_role[]))
 or private.has_team_role(team_id,array['worship_leader']::public.team_role[]));
-- The leader UPDATE path supports existing soft deletion only; this trigger
-- prevents it being used for any published-content edit or protected metadata.
create function private.guard_song_identity_content() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if auth.uid() is not null and (not private.is_approved_member(new.team_id) or new.created_by<>auth.uid() or new.status<>'approved' or new.deleted_at is not null) then raise exception 'Song identity must match its active creator' using errcode='42501'; end if;
  return new;
 end if;
 if new.id<>old.id or new.team_id<>old.team_id or new.created_by<>old.created_by or new.status<>old.status
 or new.created_at<>old.created_at or new.seed_source is distinct from old.seed_source then raise exception 'Protected song identity cannot change' using errcode='42501'; end if;
 if auth.uid() is null then return new; end if;
 if not private.is_approved_member(old.team_id) then raise exception 'Active team membership required' using errcode='42501'; end if;
 if new.deleted_at is distinct from old.deleted_at then
  if not private.has_team_role(old.team_id,array['owner','admin','worship_leader']::public.team_role[])
   or (to_jsonb(new)-array['deleted_at','updated_at','sync_revision']) is distinct from (to_jsonb(old)-array['deleted_at','updated_at','sync_revision']) then raise exception 'Deletion authority cannot edit song content' using errcode='42501'; end if;
 elsif old.created_by<>auth.uid() and not private.has_team_role(old.team_id,array['owner','admin']::public.team_role[]) then
  raise exception 'Submit a song edit request for owner/admin approval' using errcode='42501';
 elsif old.deleted_at is not null then raise exception 'Restore the song before editing' using errcode='42501'; end if;
 return new;
end;
$$;
revoke all on function private.guard_song_identity_content() from public,anon,authenticated;
create trigger songs_guard_identity before insert or update on public.songs for each row execute function private.guard_song_identity_content();

-- Existing personal reminder receipts do not increment shared revisions.
create function private.bump_shared_content_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.shared_edit_revision:=0; return new; end if;
 if tg_table_name='notifications' then
  if (to_jsonb(new)-array['read_at','acknowledged_at','shared_edit_revision']) is distinct from (to_jsonb(old)-array['read_at','acknowledged_at','shared_edit_revision']) then new.shared_edit_revision:=old.shared_edit_revision+1; else new.shared_edit_revision:=old.shared_edit_revision; end if;
 else new.shared_edit_revision:=old.shared_edit_revision+1; end if;
 return new;
end;
$$;
revoke all on function private.bump_shared_content_revision() from public,anon,authenticated;
create trigger announcements_shared_revision before insert or update on public.announcements for each row execute function private.bump_shared_content_revision();
create trigger notifications_shared_revision before insert or update on public.notifications for each row execute function private.bump_shared_content_revision();
create trigger dance_notes_shared_revision before insert or update on public.dance_notes for each row execute function private.bump_shared_content_revision();
create function private.guard_shared_notice_choreography() returns trigger language plpgsql security definer set search_path='' as $$
declare v_type text;
begin
 v_type:=case tg_table_name when 'dance_notes' then 'choreography' else 'reminder' end;
 if tg_table_name='notifications' and (to_jsonb(new)-array['read_at','acknowledged_at','shared_edit_revision'])=(to_jsonb(old)-array['read_at','acknowledged_at','shared_edit_revision']) then
  if auth.uid() is not null and (old.profile_id<>auth.uid() or not private.is_approved_member(old.team_id)) then raise exception 'Only the recipient can update a personal receipt' using errcode='42501'; end if;
  return new;
 end if;
 if auth.uid() is not null and not private.can_review_shared_edit(old.team_id,v_type) then raise exception 'Shared changes require the responsible reviewer' using errcode='42501'; end if;
 if new.team_id<>old.team_id or new.id<>old.id or new.created_by is distinct from old.created_by then raise exception 'Shared identity cannot change' using errcode='42501'; end if;
 if tg_table_name='notifications' and (to_jsonb(new)-array['title','body','priority','shared_edit_revision']) is distinct from (to_jsonb(old)-array['title','body','priority','shared_edit_revision']) then raise exception 'Reminder recipients, schedule and personal receipts cannot change with shared content' using errcode='42501'; end if;
 if tg_table_name='dance_notes' and (to_jsonb(new)->'song_id' is distinct from to_jsonb(old)->'song_id' or to_jsonb(new)->'event_id' is distinct from to_jsonb(old)->'event_id') then raise exception 'Choreography links cannot change' using errcode='42501'; end if;
 return new;
end;
$$;
revoke all on function private.guard_shared_notice_choreography() from public,anon,authenticated;
create trigger notifications_guard_content before update on public.notifications for each row execute function private.guard_shared_notice_choreography();
create trigger dance_notes_guard_content before update on public.dance_notes for each row execute function private.guard_shared_notice_choreography();

-- Mirror every actual content write in revisions and the existing sync stream.
create function private.bump_workspace_sync_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.sync_revision not in (0,1) then raise exception 'Invalid initial revision' using errcode='22023'; end if;
  new.sync_revision:=1;
 else
  if new.sync_revision not in (old.sync_revision,old.sync_revision+1) then raise exception 'Invalid revision' using errcode='22023'; end if;
  new.sync_revision:=old.sync_revision+1;
 end if;
 return new;
end;
$$;
create function private.record_workspace_sync_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_type text; v_row jsonb; v_revision bigint;
begin
 v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_op='DELETE' then v_row:=v_row || jsonb_build_object('deleted_at',clock_timestamp()); end if;
 v_revision:=(v_row->>'sync_revision')::bigint+case when tg_op='DELETE' then 1 else 0 end;
 if tg_table_name='setlist_songs' then select team_id into v_team from public.setlists where id=(v_row->>'setlist_id')::uuid; v_type:='setlist_song';
 else v_team:=(v_row->>'team_id')::uuid; v_type:=case tg_table_name when 'songs' then 'song' when 'events' then 'event' else 'setlist' end; end if;
 -- A parent cascade already emits the parent tombstone when its row is gone.
 if v_team is null then return old; end if;
 if tg_op='DELETE' or v_row->>'deleted_at' is not null then
  v_row:=jsonb_build_object('id',v_row->'id','team_id',v_team,'setlist_id',v_row->'setlist_id','deleted_at',v_row->'deleted_at',
    'approval_status',v_row->'approval_status','status',v_row->'status','created_by',v_row->'created_by');
 end if;
 insert into public.worship_sync_changes(team_id,entity_type,entity_id,operation,revision,payload)
 values(v_team,v_type,(v_row->>'id')::uuid,case when tg_op='DELETE' or v_row->>'deleted_at' is not null then 'delete' else 'upsert' end,v_revision,v_row || jsonb_build_object('sync_revision',v_revision));
 return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.bump_workspace_sync_revision(),private.record_workspace_sync_change() from public,anon,authenticated;
create trigger songs_revision before insert or update on public.songs for each row execute function private.bump_workspace_sync_revision();
create trigger setlists_revision before insert or update on public.setlists for each row execute function private.bump_workspace_sync_revision();
create trigger events_revision before insert or update on public.events for each row execute function private.bump_workspace_sync_revision();
create trigger setlist_songs_revision before insert or update on public.setlist_songs for each row execute function private.bump_workspace_sync_revision();
create trigger songs_sync_log after insert or update on public.songs for each row execute function private.record_workspace_sync_change();
create trigger setlists_sync_log after insert or update on public.setlists for each row execute function private.record_workspace_sync_change();
create trigger events_sync_log after insert or update on public.events for each row execute function private.record_workspace_sync_change();
create trigger setlist_songs_sync_log after insert or update on public.setlist_songs for each row execute function private.record_workspace_sync_change();
create trigger songs_delete_sync_log before delete on public.songs for each row execute function private.record_workspace_sync_change();
create trigger setlists_delete_sync_log before delete on public.setlists for each row execute function private.record_workspace_sync_change();
create trigger events_delete_sync_log before delete on public.events for each row execute function private.record_workspace_sync_change();
create trigger setlist_songs_delete_sync_log before delete on public.setlist_songs for each row execute function private.record_workspace_sync_change();

create function private.touch_event_assignment_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then update public.events set updated_at=clock_timestamp() where id=old.event_id; end if;
 if tg_op<>'DELETE' and (tg_op='INSERT' or new.event_id<>old.event_id) then update public.events set updated_at=clock_timestamp() where id=new.event_id; end if;
 return null;
end;
$$;
revoke all on function private.touch_event_assignment_revision() from public,anon,authenticated;
create trigger event_assignments_revision after insert or update or delete on public.event_assignments for each row execute function private.touch_event_assignment_revision();

-- Keep legacy proposals readable, but remove broad leader decisions/raw writes.
drop policy if exists "Song reviewers can view edits" on public.song_edit_requests;
drop policy if exists "Song reviewers can update edits" on public.song_edit_requests;
drop policy if exists "Song reviewers can delete edits" on public.song_edit_requests;
drop policy if exists "Song reviewers can view and review edits" on public.song_edit_requests;
revoke update,delete on public.song_edit_requests from authenticated;
revoke insert on public.song_edit_requests from authenticated;
create policy "Requester and owners admins read legacy song edits" on public.song_edit_requests for select to authenticated using (
 exists(select 1 from public.songs s where s.id=song_id and private.is_approved_member(s.team_id)
 and (submitted_by=auth.uid() or private.has_team_role(s.team_id,array['owner','admin']::public.team_role[])))
);
insert into public.shared_edit_requests(team_id,target_type,target_id,base_revision,changes,before_snapshot,reason,status,requested_by,request_nonce,legacy_song_request_id)
select s.team_id,'song',s.id,s.sync_revision,jsonb_strip_nulls(jsonb_build_object('title',r.proposed_title,'artist',r.proposed_artist,'original_key',r.proposed_key,'bpm',r.proposed_bpm,'lyrics_chords',r.proposed_lyrics_chords)),
 jsonb_build_object('title',s.title,'artist',s.artist,'original_key',s.original_key,'bpm',s.bpm,'lyrics_chords',s.lyrics_chords),
 'Legacy song proposal; original revision is unknown. Revise and resubmit.','needs_revision',r.submitted_by,gen_random_uuid(),r.id
from public.song_edit_requests r join public.songs s on s.id=r.song_id where r.status='pending';

-- Reuse the existing sync command contract with explicit authorization. Row triggers own
-- change records, so the RPC must not write duplicate/API-private log rows.
create or replace function public.apply_worship_mutation(
  p_device_id text, p_mutation_id uuid, p_command text, p_payload jsonb, p_base_revision bigint default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_team_id uuid; v_existing jsonb; v_current_revision bigint; v_event_revision bigint; v_result jsonb; v_song_id uuid;
begin
  if coalesce(jsonb_typeof(p_payload),'')<>'object' or octet_length(p_payload::text)>2200000
    or p_mutation_id is null or p_device_id is null or length(p_device_id) not between 1 and 200
    or p_base_revision is null or p_base_revision<0
    or p_command is null or p_command not in ('song.create','song.update','song.delete','song.restore',
      'setlist.create','setlist.update','setlist.delete','setlist.presentation.update') then
    raise exception 'Invalid worship mutation' using errcode='22023';
  end if;
  v_team_id := nullif(p_payload->>'teamId','')::uuid;
  if auth.uid() is null or v_team_id is null or not private.is_approved_member(v_team_id) then
    raise exception 'Active team membership required' using errcode = '28000';
  end if;
  perform private.lock_workspace_members(v_team_id);
  if p_command like 'setlist.%' and not private.has_workspace_permission(v_team_id,'setlists.manage') then
    raise exception 'Setlist changes require a setlist manager' using errcode='42501';
  end if;
  if p_command in ('setlist.create','setlist.update') and not private.has_workspace_permission(v_team_id,'events.manage') then
    raise exception 'Linked event changes require an event manager' using errcode='42501';
  end if;
  if p_command in ('song.delete','song.restore') and not private.has_team_role(v_team_id,array['owner','admin','worship_leader']::public.team_role[]) then
    raise exception 'Song deletion or restore requires a song manager' using errcode='42501';
  end if;
  v_song_id := nullif(p_payload->>'id','')::uuid;
  if v_song_id is null then raise exception 'Mutation target required' using errcode='22023'; end if;
  -- Global IDs also need protection against simultaneous creates by two teams.
  perform pg_advisory_xact_lock(hashtextextended((case when p_command like 'song.%' then 'song:' else 'setlist:' end) || v_song_id::text,0));
  if p_command in ('setlist.create','setlist.update') then
    perform pg_advisory_xact_lock(hashtextextended('event:' || (p_payload->>'eventId')::uuid::text,0));
  end if;
  if (p_command like 'song.%' and exists(select 1 from public.songs where id=v_song_id and team_id<>v_team_id))
    or (p_command like 'setlist.%' and exists(select 1 from public.setlists where id=v_song_id and team_id<>v_team_id))
    or (p_command in ('setlist.create','setlist.update') and exists(select 1 from public.events where id=(p_payload->>'eventId')::uuid and team_id<>v_team_id)) then
    raise exception 'Mutation target is unavailable' using errcode='42501';
  end if;
  if p_command like 'song.%' and exists(select 1 from public.songs where id=v_song_id and team_id=v_team_id
    and status<>'approved' and created_by<>auth.uid()
    and not private.has_team_role(v_team_id,array['owner','admin']::public.team_role[])) then
    raise exception 'Mutation target is unavailable' using errcode='42501';
  end if;
  if p_command='song.update' and not exists(select 1 from public.songs where id=v_song_id and team_id=v_team_id
    and (created_by=auth.uid() or private.has_team_role(v_team_id,array['owner','admin']::public.team_role[]))) then
    raise exception 'Song changes require the creator or an owner/admin' using errcode='42501';
  end if;
  -- Receipts are keyed globally by device/mutation; lock that same identity so
  -- simultaneous retries read the committed original result before doing work.
  perform pg_advisory_xact_lock(hashtextextended('sync-receipt:' || p_device_id || ':' || p_mutation_id::text,0));
  if exists(select 1 from public.worship_sync_receipts where device_id=p_device_id and mutation_id=p_mutation_id and team_id<>v_team_id) then
    raise exception 'Mutation receipt is unavailable' using errcode='42501';
  end if;
  select result into v_existing from public.worship_sync_receipts where device_id = p_device_id and mutation_id = p_mutation_id and team_id=v_team_id;
  if v_existing is not null then return v_existing; end if;

  if p_command in ('song.create', 'song.update') then
    v_song_id := (p_payload->>'id')::uuid;
    -- Serialize creation too: an absent row cannot provide a row lock.
    perform pg_advisory_xact_lock(hashtextextended('song:' || v_song_id::text,0));
    if p_command='song.update' and not exists(select 1 from public.songs where id=v_song_id and team_id=v_team_id
      and (created_by=auth.uid() or private.has_team_role(v_team_id,array['owner','admin']::public.team_role[]))) then
      raise exception 'Song changes require the creator or an owner/admin' using errcode='42501';
    end if;
    select sync_revision into v_current_revision from public.songs where id = v_song_id and team_id = v_team_id for update;
    if (p_command = 'song.create' and v_current_revision is not null)
      or (p_command = 'song.update' and coalesce(v_current_revision, 0) <> p_base_revision) then
      return jsonb_build_object('status', 'conflict', 'cloud_payload', (select to_jsonb(s) from public.songs s where s.id = v_song_id and s.team_id=v_team_id));
    end if;
    insert into public.songs (id, team_id, title, artist, original_key, bpm, time_signature, lyrics_chords, youtube_url, spotify_url, image_url, album, tags, created_by, sync_revision, updated_at, deleted_at)
    values (v_song_id, v_team_id, p_payload->>'title', p_payload->>'artist', p_payload->>'originalKey', nullif(p_payload->>'bpm','')::integer, coalesce(p_payload->>'timeSignature','4/4'), coalesce(p_payload->>'lyricsChords',''), nullif(p_payload->>'youtubeUrl',''), nullif(p_payload->>'spotifyUrl',''), nullif(p_payload->>'imageUrl',''), nullif(p_payload->>'album',''), array[]::text[], auth.uid(), 1, now(), null)
    on conflict (id) do update set title = excluded.title, artist = excluded.artist, original_key = excluded.original_key, bpm = excluded.bpm, time_signature = excluded.time_signature, lyrics_chords = excluded.lyrics_chords, youtube_url = excluded.youtube_url, spotify_url = excluded.spotify_url, image_url = excluded.image_url, album = excluded.album, deleted_at = null, sync_revision = public.songs.sync_revision + 1, updated_at = now() where public.songs.team_id=excluded.team_id;
    if not found then raise exception 'Mutation target is unavailable' using errcode='42501'; end if;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.songs where id = v_song_id;
  elsif p_command in ('song.delete', 'song.restore') then
    v_song_id := (p_payload->>'id')::uuid;
    update public.songs set deleted_at = case when p_command = 'song.delete' then now() else null end, sync_revision = sync_revision + 1, updated_at = now() where id = v_song_id and team_id = v_team_id and sync_revision = p_base_revision;
    if not found then return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(s) from public.songs s where s.id = v_song_id and s.team_id=v_team_id)); end if;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.songs where id = v_song_id;
  elsif p_command in ('setlist.create', 'setlist.update') then
    v_song_id := (p_payload->>'id')::uuid;
    perform pg_advisory_xact_lock(hashtextextended('setlist:' || v_song_id::text,0));
    select sync_revision into v_current_revision from public.setlists where id = v_song_id and team_id = v_team_id for update;
    if exists(select 1 from public.setlists where id=v_song_id and team_id=v_team_id and deleted_at is not null) then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id=v_song_id and sl.team_id=v_team_id));
    end if;
    if (p_command = 'setlist.create' and v_current_revision is not null)
      or (p_command = 'setlist.update' and (v_current_revision is null or v_current_revision <> p_base_revision)) then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id = v_song_id and sl.team_id=v_team_id));
    end if;
    -- Absent event rows cannot provide row locks. Serialize their creation too.
    perform pg_advisory_xact_lock(hashtextextended('event:' || (p_payload->>'eventId')::uuid::text,0));
    -- The legacy client supplies only the setlist revision. It must not rewrite
    -- an existing event until it also supplies that event's saved revision.
    select sync_revision into v_event_revision from public.events
      where id=(p_payload->>'eventId')::uuid and team_id=v_team_id for update;
    if exists(select 1 from public.events where id=(p_payload->>'eventId')::uuid and team_id=v_team_id
      and (deleted_at is not null or approval_status<>'approved')) then
      raise exception 'Linked event unavailable' using errcode='42501';
    end if;
    if found and nullif(p_payload->>'eventRevision','')::bigint is distinct from v_event_revision then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id=v_song_id and sl.team_id=v_team_id));
    end if;
    insert into public.events (id, team_id, type, name, event_date, location, starts_at, call_time, rehearsal_time, created_by, deleted_at, sync_revision)
    values ((p_payload->>'eventId')::uuid, v_team_id, coalesce(p_payload->>'eventType','service')::public.event_type, p_payload->>'name', (p_payload->>'date')::date, nullif(p_payload->>'location',''), nullif(p_payload->>'callTime','')::time, nullif(p_payload->>'callTime','')::time, nullif(p_payload->>'rehearsalTime','')::time, auth.uid(), null, 1)
    on conflict (id) do update set type=excluded.type, name=excluded.name, event_date=excluded.event_date, location=excluded.location, starts_at=excluded.starts_at, call_time=excluded.call_time, rehearsal_time=excluded.rehearsal_time, deleted_at=null, sync_revision=public.events.sync_revision + 1, updated_at=now() where public.events.team_id=excluded.team_id;
    if not found then raise exception 'Mutation target is unavailable' using errcode='42501'; end if;
    insert into public.setlists (id, team_id, event_id, name, setlist_date, location, call_time, rehearsal_time, service_times, notes, created_by, deleted_at, sync_revision, updated_at)
    values (v_song_id, v_team_id, (p_payload->>'eventId')::uuid, p_payload->>'name', (p_payload->>'date')::date, nullif(p_payload->>'location',''), nullif(p_payload->>'callTime','')::time, nullif(p_payload->>'rehearsalTime','')::time, coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'serviceTimes','[]'::jsonb))), array[]::text[]), nullif(p_payload->>'notes',''), auth.uid(), null, 1, now())
    on conflict (id) do update set event_id=excluded.event_id, name=excluded.name, setlist_date=excluded.setlist_date, location=excluded.location, call_time=excluded.call_time, rehearsal_time=excluded.rehearsal_time, service_times=excluded.service_times, notes=excluded.notes, deleted_at=null, sync_revision=public.setlists.sync_revision + 1, updated_at=now() where public.setlists.team_id=excluded.team_id;
    if not found then raise exception 'Mutation target is unavailable' using errcode='42501'; end if;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.setlists where id = v_song_id;
  elsif p_command = 'setlist.presentation.update' then
    v_song_id := (p_payload->>'id')::uuid;
    if coalesce(jsonb_typeof(p_payload->'presentationSettings'),'') <> 'object' or octet_length((p_payload->'presentationSettings')::text)>2097152 then
      raise exception 'Invalid presentation settings' using errcode = '22023';
    end if;
    select sync_revision into v_current_revision from public.setlists where id = v_song_id and team_id = v_team_id and deleted_at is null;
    if v_current_revision is null then
      raise exception 'Setlist not found' using errcode = 'P0002';
    end if;
    if v_current_revision <> p_base_revision then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id = v_song_id and sl.team_id=v_team_id));
    end if;
    update public.setlists
      set presentation_settings = p_payload->'presentationSettings',
          sync_revision = sync_revision + 1,
          updated_at = now()
      where id = v_song_id and team_id = v_team_id and sync_revision = p_base_revision and deleted_at is null;
    if not found then
      return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id = v_song_id and sl.team_id=v_team_id));
    end if;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.setlists where id = v_song_id;
  elsif p_command = 'setlist.delete' then
    v_song_id := (p_payload->>'id')::uuid;
    update public.setlists set deleted_at=now(), sync_revision=sync_revision+1, updated_at=now() where id=v_song_id and team_id=v_team_id and sync_revision=p_base_revision;
    if not found then return jsonb_build_object('status','conflict','cloud_payload',(select to_jsonb(sl) from public.setlists sl where sl.id=v_song_id and sl.team_id=v_team_id)); end if;
    update public.setlist_songs set deleted_at=now(), sync_revision=sync_revision+1, updated_at=now() where setlist_id=v_song_id;
    select jsonb_build_object('status','applied','revision',sync_revision) into v_result from public.setlists where id=v_song_id;
  else
    raise exception 'Unsupported worship mutation: %', p_command using errcode = '22023';
  end if;
  insert into public.worship_sync_receipts (device_id, mutation_id, team_id, result) values (p_device_id, p_mutation_id, v_team_id, v_result);
  return v_result;
end; $$;

revoke all on function public.apply_worship_mutation(text, uuid, text, jsonb, bigint) from public, anon;
grant execute on function public.apply_worship_mutation(text, uuid, text, jsonb, bigint) to authenticated;

-- Raw song deletion would acquire song locks before its aggregate parents.
-- Creator/admin INSERT and UPDATE policies and their identity guard remain intact.
revoke delete,truncate on public.songs from public,anon,authenticated;
-- Only checked mutations may create receipts; retain the existing scoped reads.
revoke insert,update,delete,truncate,references,trigger on public.worship_sync_receipts from public,anon,authenticated;
-- Source: 20261006030000_message_paging_retry.sql
-- Bound inbox previews and make authenticated retryable sends idempotent.
alter table public.messages add column if not exists client_nonce uuid;
create unique index if not exists messages_sender_nonce_idx
  on public.messages (sender_member_id, client_nonce) where client_nonce is not null;
create index if not exists messages_channel_cursor_idx
  on public.messages (channel_id, created_at desc, id desc);

create or replace function public.get_message_previews(p_channel_ids uuid[])
returns table (channel_id uuid, message jsonb)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sign in to read messages';
  end if;
  if coalesce(cardinality(p_channel_ids), 0) > 50 then
    raise exception using errcode = '22023', message = 'At most 50 channels may be requested';
  end if;
  return query
    select c.id, to_jsonb(latest)
    from public.message_channels c
    left join lateral (
      select m.* from public.messages m where m.channel_id = c.id
      order by m.created_at desc, m.id desc limit 1
    ) latest on true
    where c.id = any(p_channel_ids)
      and exists (
        select 1 from public.message_channel_members cm
        join public.team_members tm on tm.id = cm.team_member_id
        where cm.channel_id = c.id and tm.team_id = c.team_id
          and tm.profile_id = auth.uid() and tm.status = 'active'
      )
    order by c.id;
end;
$$;
revoke all on function public.get_message_previews(uuid[]) from public, anon;
grant execute on function public.get_message_previews(uuid[]) to authenticated;

create or replace function public.send_message_once(
  p_channel_id uuid, p_client_nonce uuid, p_body text,
  p_attachment_file_id uuid default null,
  p_scheduled_for timestamptz default null,
  p_parent_message_id uuid default null
)
returns table (id uuid, created_at timestamptz)
language plpgsql security invoker set search_path = ''
as $$
declare
  member_id uuid;
  channel_team uuid;
  existing public.messages%rowtype;
begin
  if auth.uid() is null or p_client_nonce is null then
    raise exception using errcode = '42501', message = 'A signed-in send identity is required';
  end if;
  select tm.id, c.team_id into member_id, channel_team
  from public.message_channels c
  join public.message_channel_members cm on cm.channel_id = c.id
  join public.team_members tm on tm.id = cm.team_member_id and tm.team_id = c.team_id
  where c.id = p_channel_id and tm.profile_id = auth.uid() and tm.status = 'active';
  if member_id is null then
    raise exception using errcode = '42501', message = 'This conversation is unavailable';
  end if;

  select m.* into existing from public.messages m
  where m.sender_member_id = member_id and m.client_nonce = p_client_nonce;
  if not found then
    if coalesce(length(btrim(p_body)), 0) not between 1 and 20000 then
      raise exception using errcode = '22023', message = 'Message text is invalid';
    end if;
    if p_attachment_file_id is not null and not exists (
      select 1 from public.practice_files f
      where f.id = p_attachment_file_id and f.team_id = channel_team
    ) then
      raise exception using errcode = '42501', message = 'Attachment is unavailable';
    end if;
    if p_parent_message_id is not null and not exists (
      select 1 from public.messages m where m.id = p_parent_message_id and m.channel_id = p_channel_id
    ) then
      raise exception using errcode = '42501', message = 'Reply is unavailable';
    end if;
    insert into public.messages (
      channel_id, sender_member_id, body, attachment_file_id,
      scheduled_for, is_delivered, parent_message_id, client_nonce
    ) values (
      p_channel_id, member_id, p_body, p_attachment_file_id,
      p_scheduled_for, p_scheduled_for is null, p_parent_message_id, p_client_nonce
    ) on conflict (sender_member_id, client_nonce) where client_nonce is not null do nothing;
    select m.* into existing from public.messages m
    where m.sender_member_id = member_id and m.client_nonce = p_client_nonce;
  end if;
  if existing.channel_id is distinct from p_channel_id
     or existing.body is distinct from p_body
     or existing.attachment_file_id is distinct from p_attachment_file_id
     or existing.scheduled_for is distinct from p_scheduled_for
     or existing.parent_message_id is distinct from p_parent_message_id then
    raise exception using errcode = '22023', message = 'Send identity already belongs to a different message';
  end if;
  return query select existing.id, existing.created_at;
end;
$$;
revoke all on function public.send_message_once(uuid, uuid, text, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.send_message_once(uuid, uuid, text, uuid, timestamptz, uuid) to authenticated;
-- Source: 20261006040000_shared_preparation_service_order.sql
-- Shared plans are leader-owned documents. Personal responses are separately
-- authorized and never change a team's approved plan or another member's data.
create table public.rehearsal_plans (
  setlist_id uuid primary key references public.setlists(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  allocations jsonb not null default '[]'::jsonb,
  tasks jsonb not null default '[]'::jsonb,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.rehearsal_task_responses (
  setlist_id uuid not null references public.rehearsal_plans(setlist_id) on delete cascade,
  task_key text not null,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (setlist_id, task_key, team_member_id)
);
create table public.song_readiness (
  event_id uuid not null references public.events(id) on delete cascade,
  slot_id uuid not null references public.setlist_songs(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  state text not null check (state in ('not_started','practicing','ready','needs_help')),
  note text not null default '' check (length(note) <= 500),
  updated_at timestamptz not null default now(),
  primary key (event_id, slot_id, team_member_id)
);
create table public.service_orders (
  event_id uuid primary key references public.events(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  entries jsonb not null default '[]'::jsonb,
  required_roles text[] not null default '{}',
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.assignment_responses (
  assignment_id uuid primary key references public.event_assignments(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  state text not null check (state in ('pending','confirmed','declined')),
  note text not null default '' check (length(note) <= 500),
  updated_at timestamptz not null default now()
);
create index rehearsal_plans_team_idx on public.rehearsal_plans(team_id);
create index service_orders_team_idx on public.service_orders(team_id);
create index readiness_member_idx on public.song_readiness(team_member_id,event_id);
create index assignment_responses_member_idx on public.assignment_responses(team_member_id);

alter table public.rehearsal_plans enable row level security;
alter table public.rehearsal_task_responses enable row level security;
alter table public.song_readiness enable row level security;
alter table public.service_orders enable row level security;
alter table public.assignment_responses enable row level security;
revoke all on public.rehearsal_plans, public.rehearsal_task_responses, public.song_readiness,
  public.service_orders, public.assignment_responses from public, anon, authenticated;
grant select on public.rehearsal_plans, public.rehearsal_task_responses, public.song_readiness,
  public.service_orders, public.assignment_responses to authenticated;
create policy "Active team can read rehearsal plans" on public.rehearsal_plans for select to authenticated
  using (private.is_approved_member(team_id));
create policy "Active team can read preparation checks" on public.rehearsal_task_responses for select to authenticated
  using (exists (select 1 from public.rehearsal_plans p where p.setlist_id = rehearsal_task_responses.setlist_id));
create policy "Active team can read service orders" on public.service_orders for select to authenticated
  using (private.is_approved_member(team_id));
create policy "Active team can read song readiness" on public.song_readiness for select to authenticated
  using (exists (select 1 from public.setlist_songs ss join public.setlists s on s.id=ss.setlist_id
    join public.events e on e.id=s.event_id and e.id=song_readiness.event_id
    where ss.id=song_readiness.slot_id and private.is_approved_member(s.team_id)));
create policy "Active team can read assignment responses" on public.assignment_responses for select to authenticated
  using (exists (select 1 from public.event_assignments a join public.events e on e.id=a.event_id
    where a.id=assignment_responses.assignment_id and private.is_approved_member(e.team_id)));

-- These helpers are callable only from explicitly authorized public RPCs and
-- later typed request adapters. No caller-selected SQL/table/column is executed.
create function private.apply_rehearsal_plan(p_setlist_id uuid, p_expected_revision integer, p_allocations jsonb, p_tasks jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_revision integer; v_next integer; v_allowed text[] := array[
  'Tune instruments and check cables','Check monitors and click levels','Agree intros, endings and transitions',
  'Warm up and check comfortable keys','Confirm lead vocals and harmonies','Agree cues and microphone handoffs',
  'Confirm roles, call time and attendance','Verify lyrics and slide order','Check microphones and backing tracks','Confirm prayer, media and dance cues'];
begin
  -- Member references precede workspace locks, as in save_event_workspace.
  if coalesce(jsonb_typeof(p_allocations),'')<>'array' or jsonb_array_length(p_allocations)>200
    or coalesce(jsonb_typeof(p_tasks),'')<>'array' or jsonb_array_length(p_tasks)<>10
    or octet_length(p_allocations::text)>200000 or octet_length(p_tasks::text)>10000 then
    raise exception 'Invalid plan' using errcode='22023';
  end if;
  select team_id into v_team from public.setlists where id=p_setlist_id and deleted_at is null;
  perform private.lock_workspace_members(v_team);
  if not private.has_workspace_permission(v_team,'setlists.manage') then
    raise exception 'Plan editing requires a setlist manager' using errcode='42501';
  end if;
  if not private.is_approved_member(v_team) then raise exception 'Active membership required' using errcode='42501'; end if;
  select team_id into v_team from public.setlists where id=p_setlist_id and deleted_at is null for update;
  if v_team is null then raise exception 'Setlist unavailable' using errcode='42501'; end if;
  select revision into v_revision from public.rehearsal_plans where setlist_id=p_setlist_id for update;
  if p_expected_revision is null or p_expected_revision<>coalesce(v_revision,0) then
    raise exception 'Plan changed. Reload before saving; keep your draft.' using errcode='40001';
  end if;
  if coalesce(jsonb_typeof(p_allocations),'')<>'array' or jsonb_array_length(p_allocations)>200
    or coalesce(jsonb_typeof(p_tasks),'')<>'array' or jsonb_array_length(p_tasks)<>10
    or octet_length(p_allocations::text)>200000 or octet_length(p_tasks::text)>10000 then
    raise exception 'Invalid plan' using errcode='22023';
  end if;
  perform 1 from public.setlist_songs ss where ss.setlist_id=p_setlist_id and
    ss.id in(select (x->>'slot_id')::uuid from jsonb_array_elements(p_allocations) x) order by ss.id for share;
  if exists (select 1 from jsonb_array_elements(p_allocations) x
    where jsonb_typeof(x)<>'object' or coalesce(jsonb_typeof(x->'minutes'),'')<>'number'
      or x-array['slot_id','minutes','focus']<>'{}'::jsonb
      or (x->>'minutes')::numeric not between 0 and 120 or (x->>'minutes')::numeric<>trunc((x->>'minutes')::numeric)
      or coalesce(jsonb_typeof(x->'focus'),'')<>'string' or length(x->>'focus')>500
      or not exists(select 1 from public.setlist_songs ss where ss.id=(x->>'slot_id')::uuid and ss.setlist_id=p_setlist_id and ss.deleted_at is null))
    or (select count(*)<>count(distinct x->>'slot_id') from jsonb_array_elements(p_allocations) x)
    or exists(select 1 from jsonb_array_elements(p_tasks) x where jsonb_typeof(x)<>'object'
      or x-array['key','assignee_member_id']<>'{}'::jsonb
      or coalesce(x->>'key','')<>all(v_allowed)
      or (x->>'assignee_member_id' is not null and not exists(select 1 from public.team_members tm
        where tm.id=(x->>'assignee_member_id')::uuid and tm.team_id=v_team and tm.status='active')))
    or (select count(distinct x->>'key')<>10 from jsonb_array_elements(p_tasks) x) then
    raise exception 'Invalid slots, allocations or task assignees' using errcode='22023';
  end if;
  v_next:=coalesce(v_revision,0)+1;
  insert into public.rehearsal_plans(setlist_id,team_id,revision,allocations,tasks,updated_by)
    values(p_setlist_id,v_team,v_next,p_allocations,p_tasks,auth.uid())
    on conflict(setlist_id) do update set revision=v_next,allocations=p_allocations,tasks=p_tasks,updated_by=auth.uid(),updated_at=now();
  delete from public.rehearsal_task_responses r where r.setlist_id=p_setlist_id and not exists(
    select 1 from jsonb_array_elements(p_tasks) x where x->>'key'=r.task_key and (x->>'assignee_member_id')::uuid=r.team_member_id);
  return v_next;
end;
$$;
revoke all on function private.apply_rehearsal_plan(uuid,integer,jsonb,jsonb) from public,anon,authenticated;
create function public.save_rehearsal_plan(p_setlist_id uuid,p_expected_revision integer,p_allocations jsonb,p_tasks jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.setlists where id=p_setlist_id;
  if auth.uid() is null or v_team is null or not private.has_workspace_permission(v_team,'setlists.manage') then
    raise exception 'Plan editing requires a setlist manager' using errcode='42501';
  end if;
  return private.apply_rehearsal_plan(p_setlist_id,p_expected_revision,p_allocations,p_tasks);
end;
$$;
revoke all on function public.save_rehearsal_plan(uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.save_rehearsal_plan(uuid,integer,jsonb,jsonb) to authenticated;

create function public.respond_preparation_task(p_setlist_id uuid,p_task_key text,p_completed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_member uuid; v_plan public.rehearsal_plans%rowtype;
begin
  select * into v_plan from public.rehearsal_plans where setlist_id=p_setlist_id;
  perform private.lock_workspace_members(v_plan.team_id);
  select id into v_member from public.team_members where team_id=v_plan.team_id and profile_id=auth.uid() and status='active' for share;
  perform 1 from public.setlists where id=p_setlist_id and team_id=v_plan.team_id and deleted_at is null for share;
  if not found then raise exception 'Setlist unavailable' using errcode='42501'; end if;
  select * into v_plan from public.rehearsal_plans where setlist_id=p_setlist_id for share;
  if v_member is null or p_completed is null or not exists(select 1 from jsonb_array_elements(v_plan.tasks) x
    where x->>'key'=p_task_key and (x->>'assignee_member_id')::uuid=v_member) then
    raise exception 'Only the assigned member can respond' using errcode='42501';
  end if;
  insert into public.rehearsal_task_responses(setlist_id,task_key,team_member_id,completed)
    values(p_setlist_id,p_task_key,v_member,p_completed)
    on conflict(setlist_id,task_key,team_member_id) do update set completed=p_completed,updated_at=now();
end;
$$;
revoke all on function public.respond_preparation_task(uuid,text,boolean) from public,anon;
grant execute on function public.respond_preparation_task(uuid,text,boolean) to authenticated;

create function public.respond_song_readiness(p_slot_id uuid,p_state text,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare v_member uuid; v_event uuid; v_team uuid; v_setlist uuid;
begin
  select setlist_id into v_setlist from public.setlist_songs where id=p_slot_id and deleted_at is null;
  select team_id into v_team from public.setlists where id=v_setlist and deleted_at is null;
  perform private.lock_workspace_members(v_team);
  select id into v_member from public.team_members where team_id=v_team and profile_id=auth.uid() and status='active' for share;
  select event_id,team_id into v_event,v_team from public.setlists
    where id=v_setlist and deleted_at is null for share;
  perform 1 from public.setlist_songs where id=p_slot_id and setlist_id=v_setlist and deleted_at is null for share;
  if not found then raise exception 'Song slot unavailable' using errcode='42501'; end if;
  perform 1 from public.events where id=v_event and team_id=v_team
    and approval_status='approved' and deleted_at is null for share;
  if not found or v_member is null then
    raise exception 'Readiness requires an approved linked event and your assignment' using errcode='42501';
  end if;
  perform 1 from public.event_assignments where event_id=v_event and team_member_id=v_member order by id for share;
  if not found then
    raise exception 'Readiness requires an approved linked event and your assignment' using errcode='42501';
  end if;
  if p_state is null or p_state not in ('not_started','practicing','ready','needs_help') or p_note is null or length(p_note)>500 then
    raise exception 'Invalid readiness response' using errcode='22023';
  end if;
  insert into public.song_readiness(event_id,slot_id,team_member_id,state,note) values(v_event,p_slot_id,v_member,p_state,p_note)
    on conflict(event_id,slot_id,team_member_id) do update set state=p_state,note=p_note,updated_at=now();
end;
$$;
revoke all on function public.respond_song_readiness(uuid,text,text) from public,anon;
grant execute on function public.respond_song_readiness(uuid,text,text) to authenticated;

create function private.apply_service_order(p_event_id uuid,p_expected_revision integer,p_entries jsonb,p_required_roles text[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_revision integer; v_next integer;
begin
  -- Match the workspace RPC lock order: related setlists before their event.
  if coalesce(jsonb_typeof(p_entries),'')<>'array' or jsonb_array_length(p_entries)>200 or octet_length(p_entries::text)>500000 then
    raise exception 'Invalid service order' using errcode='22023';
  end if;
  select team_id into v_team from public.events where id=p_event_id;
  perform private.lock_workspace_members(v_team);
  if not private.has_workspace_permission(v_team,'events.manage') then
    raise exception 'Service order editing requires an event manager' using errcode='42501';
  end if;
  if not private.is_approved_member(v_team) then raise exception 'Active membership required' using errcode='42501'; end if;
  perform 1 from public.setlists where event_id=p_event_id order by id for update;
  select team_id into v_team from public.events where id=p_event_id and approval_status='approved' and deleted_at is null for update;
  if v_team is null then raise exception 'Approved event unavailable' using errcode='42501'; end if;
  select revision into v_revision from public.service_orders where event_id=p_event_id for update;
  if p_expected_revision is null or p_expected_revision<>coalesce(v_revision,0) then
    raise exception 'Service order changed. Reload before saving; keep your draft.' using errcode='40001';
  end if;
  if coalesce(jsonb_typeof(p_entries),'')<>'array' or jsonb_array_length(p_entries)>200 or octet_length(p_entries::text)>500000
    or p_required_roles is null or cardinality(p_required_roles)>30
    or exists(select 1 from unnest(p_required_roles) r where r is null or length(trim(r)) not between 1 and 80)
    or (select count(*)<>count(distinct r) from unnest(p_required_roles) r) then
    raise exception 'Invalid service order' using errcode='22023';
  end if;
  perform 1 from public.setlist_songs ss join public.setlists s on s.id=ss.setlist_id
    where s.event_id=p_event_id and s.team_id=v_team and
      ss.id in(select (x->>'slot_id')::uuid from jsonb_array_elements(p_entries) x) order by ss.id for share of ss;
  if exists(select 1 from jsonb_array_elements(p_entries) x where jsonb_typeof(x)<>'object'
    or x-array['id','kind','title','slot_id','duration_seconds','responsible_member_id','cue']<>'{}'::jsonb
    or coalesce(x->>'kind','') not in ('song','prayer','reading','announcement','media','other')
    or x->>'id' is null or (x->>'id')::uuid is null
    or length(trim(coalesce(x->>'title',''))) not between 1 and 160
    or coalesce(jsonb_typeof(x->'duration_seconds'),'')<>'number'
    or (x->>'duration_seconds')::numeric not between 0 and 7200 or (x->>'duration_seconds')::numeric<>trunc((x->>'duration_seconds')::numeric)
    or coalesce(jsonb_typeof(x->'cue'),'')<>'string' or length(x->>'cue')>2000
    or (x->>'responsible_member_id' is not null and not exists(select 1 from public.team_members tm
      where tm.id=(x->>'responsible_member_id')::uuid and tm.team_id=v_team and tm.status='active'))
    or ((x->>'kind'='song') is distinct from (x->>'slot_id' is not null))
    or (x->>'slot_id' is not null and not exists(select 1 from public.setlist_songs ss join public.setlists s on s.id=ss.setlist_id
      where ss.id=(x->>'slot_id')::uuid and s.event_id=p_event_id and s.team_id=v_team and s.deleted_at is null and ss.deleted_at is null)))
    or (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_entries) x) then
    raise exception 'Invalid order items, songs or responsible members' using errcode='22023';
  end if;
  v_next:=coalesce(v_revision,0)+1;
  insert into public.service_orders(event_id,team_id,revision,entries,required_roles,updated_by)
    values(p_event_id,v_team,v_next,p_entries,p_required_roles,auth.uid())
    on conflict(event_id) do update set revision=v_next,entries=p_entries,required_roles=p_required_roles,updated_by=auth.uid(),updated_at=now();
  return v_next;
end;
$$;
revoke all on function private.apply_service_order(uuid,integer,jsonb,text[]) from public,anon,authenticated;
create function public.save_service_order(p_event_id uuid,p_expected_revision integer,p_entries jsonb,p_required_roles text[])
returns integer language plpgsql security definer set search_path='' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.events where id=p_event_id;
  if auth.uid() is null or v_team is null or not private.has_workspace_permission(v_team,'events.manage') then
    raise exception 'Service order editing requires an event manager' using errcode='42501';
  end if;
  return private.apply_service_order(p_event_id,p_expected_revision,p_entries,p_required_roles);
end;
$$;
revoke all on function public.save_service_order(uuid,integer,jsonb,text[]) from public,anon;
grant execute on function public.save_service_order(uuid,integer,jsonb,text[]) to authenticated;

create function public.respond_assignment(p_assignment_id uuid,p_state text,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare v_member uuid; v_event uuid; v_team uuid;
begin
  select event_id into v_event from public.event_assignments where id=p_assignment_id;
  select team_id into v_team from public.events where id=v_event and approval_status='approved' and deleted_at is null;
  perform private.lock_workspace_members(v_team);
  select tm.id into v_member from public.event_assignments a
    join public.team_members tm on tm.id=a.team_member_id and tm.team_id=v_team
    where a.id=p_assignment_id and a.event_id=v_event and tm.profile_id=auth.uid() and tm.status='active'
    for share of tm;
  if v_member is null then raise exception 'Only the assigned member can respond' using errcode='42501'; end if;
  perform 1 from public.events where id=v_event and team_id=v_team and approval_status='approved' and deleted_at is null for share;
  if not found then raise exception 'Assignment event changed; reload before responding' using errcode='42501'; end if;
  perform 1 from public.event_assignments where id=p_assignment_id and event_id=v_event and team_member_id=v_member for share;
  if not found then raise exception 'Assignment changed; reload before responding' using errcode='42501'; end if;
  if p_state is null or p_state not in ('pending','confirmed','declined') or p_note is null or length(p_note)>500 then
    raise exception 'Invalid assignment response' using errcode='22023';
  end if;
  insert into public.assignment_responses(assignment_id,team_member_id,state,note) values(p_assignment_id,v_member,p_state,p_note)
    on conflict(assignment_id) do update set team_member_id=v_member,state=p_state,note=p_note,updated_at=now();
end;
$$;
revoke all on function public.respond_assignment(uuid,text,text) from public,anon;
grant execute on function public.respond_assignment(uuid,text,text) to authenticated;
-- Source: 20261006050000_shared_edit_workflow_adapters.sql
-- Extend the shared request boundary after the preparation/service-order tables.
alter table public.shared_edit_requests drop constraint shared_edit_requests_target_type_check;
alter table public.shared_edit_requests add constraint shared_edit_requests_target_type_check check (
 target_type in ('song','setlist','event','song_slot','announcement','reminder','choreography','rehearsal_plan','service_order'));

alter function private.shared_edit_permission(text) rename to shared_edit_permission_core;
create function private.shared_edit_permission(p_type text) returns text language sql immutable set search_path='' as $$
 select case p_type when 'rehearsal_plan' then 'setlists.manage' when 'service_order' then 'events.manage' else private.shared_edit_permission_core(p_type) end;
$$;
revoke all on function private.shared_edit_permission(text) from public,anon,authenticated;

alter function private.can_read_shared_target(text,uuid,uuid) rename to can_read_shared_target_core;
create function private.can_read_shared_target(p_type text,p_id uuid,p_team uuid) returns boolean language sql stable security definer set search_path='' as $$
 select case p_type
 when 'rehearsal_plan' then private.is_approved_member(p_team) and exists(select 1 from public.setlists where id=p_id and team_id=p_team and deleted_at is null)
 when 'service_order' then private.is_approved_member(p_team) and exists(select 1 from public.events where id=p_id and team_id=p_team and deleted_at is null and approval_status='approved')
 else private.can_read_shared_target_core(p_type,p_id,p_team) end;
$$;
revoke all on function private.can_read_shared_target(text,uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_read_shared_target(text,uuid,uuid) to authenticated;

alter function private.validate_shared_edit_changes(text,jsonb) rename to validate_shared_edit_changes_core;
create function private.validate_shared_edit_changes(p_type text,p_changes jsonb) returns void language plpgsql set search_path='' as $$
declare v_item jsonb; v_key text; v_allowed text[]:=array[
 'Tune instruments and check cables','Check monitors and click levels','Agree intros, endings and transitions',
 'Warm up and check comfortable keys','Confirm lead vocals and harmonies','Agree cues and microphone handoffs',
 'Confirm roles, call time and attendance','Verify lyrics and slide order','Check microphones and backing tracks','Confirm prayer, media and dance cues'];
begin
 if p_type not in ('rehearsal_plan','service_order') then perform private.validate_shared_edit_changes_core(p_type,p_changes); return; end if;
 if p_changes is null or jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb or octet_length(p_changes::text)>262144
 or p_changes-(case p_type when 'rehearsal_plan' then array['allocations','tasks'] else array['entries','required_roles'] end)<>'{}'::jsonb then raise exception 'Invalid workflow proposal' using errcode='22023'; end if;
 for v_key in select jsonb_object_keys(p_changes) loop
  if jsonb_typeof(p_changes->v_key)<>'array' then raise exception 'Invalid workflow list' using errcode='22023'; end if;
  if jsonb_array_length(p_changes->v_key)>(case when v_key='required_roles' then 30 else 200 end) then raise exception 'Workflow list too large' using errcode='22023'; end if;
  for v_item in select value from jsonb_array_elements(p_changes->v_key) loop
   case v_key
   when 'allocations' then
    if jsonb_typeof(v_item)<>'object' or v_item-array['slot_id','minutes','focus']<>'{}'::jsonb
     or coalesce(jsonb_typeof(v_item->'minutes'),'')<>'number' or (v_item->>'minutes')::numeric not between 0 and 120
     or (v_item->>'minutes')::numeric<>trunc((v_item->>'minutes')::numeric)
     or coalesce(jsonb_typeof(v_item->'focus'),'')<>'string' or length(v_item->>'focus')>500
     or coalesce(jsonb_typeof(v_item->'slot_id'),'')<>'string' then raise exception 'Invalid song allocation' using errcode='22023'; end if;
    perform (v_item->>'slot_id')::uuid;
   when 'tasks' then
    if jsonb_typeof(v_item)<>'object' or v_item-array['key','assignee_member_id']<>'{}'::jsonb
     or coalesce(jsonb_typeof(v_item->'key'),'')<>'string' or coalesce(v_item->>'key','')<>all(v_allowed)
     or coalesce(jsonb_typeof(v_item->'assignee_member_id'),'') not in ('null','string') then raise exception 'Invalid task' using errcode='22023'; end if;
    perform (v_item->>'assignee_member_id')::uuid;
   when 'required_roles' then
    if jsonb_typeof(v_item)<>'string' or length(trim(v_item#>>'{}')) not between 1 and 80 then raise exception 'Invalid required role' using errcode='22023'; end if;
   when 'entries' then
    if jsonb_typeof(v_item)<>'object' or v_item-array['id','kind','title','slot_id','duration_seconds','responsible_member_id','cue']<>'{}'::jsonb
     or coalesce(v_item->>'kind','') not in ('song','prayer','reading','announcement','media','other')
     or coalesce(jsonb_typeof(v_item->'id'),'')<>'string'
     or coalesce(jsonb_typeof(v_item->'title'),'')<>'string' or length(trim(v_item->>'title')) not between 1 and 160
     or coalesce(jsonb_typeof(v_item->'duration_seconds'),'')<>'number' or (v_item->>'duration_seconds')::numeric not between 0 and 7200
     or (v_item->>'duration_seconds')::numeric<>trunc((v_item->>'duration_seconds')::numeric)
     or coalesce(jsonb_typeof(v_item->'cue'),'')<>'string' or length(v_item->>'cue')>2000
     or coalesce(jsonb_typeof(v_item->'slot_id'),'') not in ('string','null')
     or coalesce(jsonb_typeof(v_item->'responsible_member_id'),'') not in ('string','null')
     or ((v_item->>'kind'='song') is distinct from (v_item->>'slot_id' is not null)) then raise exception 'Invalid order entry' using errcode='22023'; end if;
    perform (v_item->>'id')::uuid;
    perform (v_item->>'slot_id')::uuid;
    perform (v_item->>'responsible_member_id')::uuid;
   end case;
  end loop;
  if v_key='tasks' and (jsonb_array_length(p_changes->v_key)<>10 or (select count(distinct x->>'key') from jsonb_array_elements(p_changes->v_key) x)<>10)
   or v_key='allocations' and (select count(*)<>count(distinct x->>'slot_id') from jsonb_array_elements(p_changes->v_key) x)
   or v_key='entries' and (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_changes->v_key) x)
   or v_key='required_roles' and (select count(*)<>count(distinct x#>>'{}') from jsonb_array_elements(p_changes->v_key) x) then raise exception 'Duplicate or missing workflow entries' using errcode='22023'; end if;
 end loop;
end;
$$;
revoke all on function private.validate_shared_edit_changes(text,jsonb) from public,anon,authenticated;

alter function private.shared_edit_target(text,uuid,boolean) rename to shared_edit_target_core;
create function private.shared_edit_target(p_type text,p_id uuid,p_lock boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_revision bigint; v_values jsonb;
begin
 if p_type='rehearsal_plan' then
  if p_lock then perform 1 from public.setlists where id=p_id for update; end if;
  select team_id into v_team from public.setlists where id=p_id and deleted_at is null;
  if p_lock then perform 1 from public.rehearsal_plans where setlist_id=p_id for update; end if;
  select revision,jsonb_build_object('allocations',allocations,'tasks',tasks) into v_revision,v_values from public.rehearsal_plans where setlist_id=p_id and team_id=v_team;
  if v_values is null then
   select jsonb_build_object('allocations','[]'::jsonb,'tasks',jsonb_agg(jsonb_build_object('key',key,'assignee_member_id',null) order by ordinal)) into v_values
   from unnest(array['Tune instruments and check cables','Check monitors and click levels','Agree intros, endings and transitions','Warm up and check comfortable keys','Confirm lead vocals and harmonies','Agree cues and microphone handoffs','Confirm roles, call time and attendance','Verify lyrics and slide order','Check microphones and backing tracks','Confirm prayer, media and dance cues']) with ordinality t(key,ordinal);
  end if;
 elsif p_type='service_order' then
  if p_lock then
   perform 1 from public.setlists where event_id=p_id order by id for update;
   perform 1 from public.events where id=p_id for update;
  end if;
  select team_id into v_team from public.events where id=p_id and deleted_at is null and approval_status='approved';
  if p_lock then perform 1 from public.service_orders where event_id=p_id for update; end if;
  select revision,jsonb_build_object('entries',entries,'required_roles',required_roles) into v_revision,v_values from public.service_orders where event_id=p_id and team_id=v_team;
  v_values:=coalesce(v_values,jsonb_build_object('entries','[]'::jsonb,'required_roles','[]'::jsonb));
 else return private.shared_edit_target_core(p_type,p_id,p_lock); end if;
 if v_team is null or auth.uid() is null or not private.can_read_shared_target(p_type,p_id,v_team) then raise exception 'Target is unavailable' using errcode='42501'; end if;
 return jsonb_build_object('team_id',v_team,'revision',coalesce(v_revision,0),'values',v_values);
end;
$$;
revoke all on function private.shared_edit_target(text,uuid,boolean) from public,anon,authenticated;

alter function private.apply_shared_edit(text,uuid,jsonb) rename to apply_shared_edit_core;
create function private.apply_shared_edit(p_type text,p_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v_revision integer;
begin
 if p_type='rehearsal_plan' then
  select revision into v_revision from public.rehearsal_plans where setlist_id=p_id;
  perform private.apply_rehearsal_plan(p_id,coalesce(v_revision,0),p_values->'allocations',p_values->'tasks');
 elsif p_type='service_order' then
  select revision into v_revision from public.service_orders where event_id=p_id;
  perform private.apply_service_order(p_id,coalesce(v_revision,0),p_values->'entries',array(select jsonb_array_elements_text(p_values->'required_roles')));
 else perform private.apply_shared_edit_core(p_type,p_id,p_values); end if;
end;
$$;
revoke all on function private.apply_shared_edit(text,uuid,jsonb) from public,anon,authenticated;

-- Policies retain function OIDs across renames; bind them to the extended helper.
drop policy "Actor and eligible reviewer can read bounded shared requests" on public.shared_edit_requests;
create policy "Actor and eligible reviewer can read bounded shared requests" on public.shared_edit_requests for select to authenticated using (
 private.can_read_shared_target(target_type,target_id,team_id) and (requested_by=auth.uid() or private.can_review_shared_edit(team_id,target_type))
);
revoke all on function private.can_read_shared_target_core(text,uuid,uuid) from public,anon,authenticated;

create function public.get_shared_edit_target(p_target_type text,p_target_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 return private.shared_edit_target(p_target_type,p_target_id,false);
end;
$$;
revoke all on function public.get_shared_edit_target(text,uuid) from public,anon;
grant execute on function public.get_shared_edit_target(text,uuid) to authenticated;
-- Source: 20261006060000_global_setlist_search.sql
-- Filter before PostgREST count/order/range. Never truncate matching song IDs.
create function public.search_setlists(p_team_id uuid,p_query text)
returns setof public.setlists language plpgsql stable security invoker set search_path='' as $$
declare v_query text:=lower(trim(coalesce(p_query,'')));
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  if length(v_query)>160 then raise exception 'Search is too long' using errcode='22023'; end if;
  return query select s.* from public.setlists s
    where s.team_id=p_team_id and s.deleted_at is null and (
      v_query='' or position(v_query in lower(s.name))>0
      or position(v_query in lower(coalesce(s.location,'')))>0
      or position(v_query in s.setlist_date::text)>0
      or position(v_query in lower(coalesce(s.service_times::text,'')))>0
      or exists(select 1 from public.team_members tm join public.profiles p on p.id=tm.profile_id
        where tm.id=s.leader_member_id and tm.team_id=p_team_id and position(v_query in lower(coalesce(p.full_name,'')))>0)
      or exists(select 1 from public.setlist_songs ss join public.songs song on song.id=ss.song_id
        where ss.setlist_id=s.id and ss.deleted_at is null and song.team_id=p_team_id
          and song.deleted_at is null and position(v_query in lower(song.title))>0));
end;
$$;
revoke all on function public.search_setlists(uuid,text) from public,anon;
grant execute on function public.search_setlists(uuid,text) to authenticated;
-- Source: 20261006070000_personal_preparation_summary.sql
-- Actor-derived outstanding saved checks, before caller count/order/range.
create function public.get_personal_preparation(p_team_id uuid)
returns table(setlist_id uuid,task_key text,setlist_name text,setlist_date date)
language plpgsql stable security invoker set search_path='' as $$
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  return query select p.setlist_id,task->>'key',s.name,s.setlist_date
    from public.rehearsal_plans p join public.setlists s on s.id=p.setlist_id and s.team_id=p_team_id
    cross join lateral jsonb_array_elements(p.tasks) task
    join public.team_members tm on tm.id=(task->>'assignee_member_id')::uuid and tm.team_id=p_team_id
      and tm.profile_id=auth.uid() and tm.status='active'
    left join public.rehearsal_task_responses r on r.setlist_id=p.setlist_id and r.task_key=task->>'key' and r.team_member_id=tm.id
    where p.team_id=p_team_id and s.deleted_at is null and s.setlist_date>=current_date and not coalesce(r.completed,false);
end;
$$;
revoke all on function public.get_personal_preparation(uuid) from public,anon;
grant execute on function public.get_personal_preparation(uuid) to authenticated;
-- Source: 20261006080000_setlist_aggregate_revisions.sql
-- Child content is part of the revision guarded by setlist save/approval.
create function private.touch_setlist_aggregate_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare v_parent uuid;
begin
  for v_parent in select distinct id from unnest(array[case when tg_op<>'INSERT' then old.setlist_id end,case when tg_op<>'DELETE' then new.setlist_id end]) id where id is not null order by id loop
    update public.setlists set sync_revision=sync_revision+1,updated_at=now() where id=v_parent;
  end loop;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.touch_setlist_aggregate_revision() from public,anon,authenticated;
create trigger setlist_songs_parent_revision before insert or update or delete on public.setlist_songs for each row execute function private.touch_setlist_aggregate_revision();

create function public.mutate_setlist_slot(p_setlist_id uuid,p_slot_id uuid,p_operation text,p_values jsonb default '{}')
returns void language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_ids uuid[]; v_target integer; v_count integer; v_song uuid;
begin
  select team_id into v_team from public.setlists where id=p_setlist_id and deleted_at is null;
  if auth.uid() is null or not private.has_workspace_permission(v_team,'setlists.manage') then raise exception 'Setlist editing unavailable' using errcode='42501'; end if;
  perform private.lock_workspace_members(v_team);
  if not private.has_workspace_permission(v_team,'setlists.manage') then raise exception 'Setlist editing unavailable' using errcode='42501'; end if;
  if p_operation not in ('add','remove','update','move') or coalesce(jsonb_typeof(p_values),'null')<>'object' or octet_length(p_values::text)>100000
    or p_values-array['song_id','assigned_key','notes','youtube_url','arrangement','band_notes','lead_member_id','slide_settings','song_order']<>'{}'::jsonb then
    raise exception 'Invalid slot changes' using errcode='22023';
  end if;
  if length(coalesce(p_values->>'notes',''))>2000 or length(coalesce(p_values->>'arrangement',''))>4000 or length(coalesce(p_values->>'band_notes',''))>4000
    or length(coalesce(p_values->>'youtube_url',''))>500 or (p_values ? 'assigned_key' and length(coalesce(p_values->>'assigned_key','')) not between 1 and 3)
    or (p_values ? 'slide_settings' and jsonb_typeof(p_values->'slide_settings')<>'object') then raise exception 'Invalid slot fields' using errcode='22023'; end if;
  if nullif(p_values->>'lead_member_id','') is not null then
    perform 1 from public.team_members where id=(p_values->>'lead_member_id')::uuid and team_id=v_team and status='active' for share;
    if not found then raise exception 'Lead unavailable' using errcode='22023'; end if;
  end if;
  perform 1 from public.setlists where id=p_setlist_id and team_id=v_team and deleted_at is null for update;
  if not found then raise exception 'Setlist editing unavailable' using errcode='42501'; end if;
  if p_operation='add' then
    v_song:=(p_values->>'song_id')::uuid;
    perform 1 from public.songs where id=v_song and team_id=v_team and deleted_at is null and status='approved' for share;
    if not found then raise exception 'Song unavailable' using errcode='22023'; end if;
    select count(*) into v_count from public.setlist_songs where setlist_id=p_setlist_id and deleted_at is null;
    if v_count>=200 then raise exception 'At most 200 songs' using errcode='22023'; end if;
    insert into public.setlist_songs(setlist_id,song_id,song_order,assigned_key,notes,youtube_url)
      values(p_setlist_id,v_song,(select coalesce(max(song_order),0)+1 from public.setlist_songs where setlist_id=p_setlist_id),p_values->>'assigned_key',p_values->>'notes',p_values->>'youtube_url');
  else
    perform 1 from public.setlist_songs where id=p_slot_id and setlist_id=p_setlist_id and deleted_at is null for update;
    if not found then raise exception 'Slot unavailable' using errcode='42501'; end if;
    if p_operation='remove' then delete from public.setlist_songs where id=p_slot_id;
    elsif p_operation='update' then
      update public.setlist_songs s set assigned_key=case when p_values ? 'assigned_key' then p_values->>'assigned_key' else s.assigned_key end,
        notes=case when p_values ? 'notes' then p_values->>'notes' else s.notes end,
        youtube_url=case when p_values ? 'youtube_url' then p_values->>'youtube_url' else s.youtube_url end,
        arrangement=case when p_values ? 'arrangement' then p_values->>'arrangement' else s.arrangement end,
        band_notes=case when p_values ? 'band_notes' then p_values->>'band_notes' else s.band_notes end,
        lead_member_id=case when p_values ? 'lead_member_id' then (p_values->>'lead_member_id')::uuid else s.lead_member_id end,
        slide_settings=case when p_values ? 'slide_settings' then p_values->'slide_settings' else s.slide_settings end where id=p_slot_id;
    end if;
  end if;
  if p_operation in ('remove','move') then
    select array_agg(id order by song_order,id) into v_ids from public.setlist_songs where setlist_id=p_setlist_id and deleted_at is null;
    if p_operation='move' then
      v_target:=(p_values->>'song_order')::integer;
      if v_target is null or v_target not between 1 and cardinality(v_ids) then raise exception 'Invalid song order' using errcode='22023'; end if;
      v_ids:=array_remove(v_ids,p_slot_id);v_ids:=coalesce(v_ids[1:v_target-1],'{}'::uuid[]) || array[p_slot_id] || coalesce(v_ids[v_target:cardinality(v_ids)],'{}'::uuid[]);
    end if;
    update public.setlist_songs set song_order=song_order+100000 where setlist_id=p_setlist_id;
    update public.setlist_songs s set song_order=r.ordinal from unnest(v_ids) with ordinality r(id,ordinal) where s.id=r.id;
  end if;
end;
$$;
revoke all on function public.mutate_setlist_slot(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.mutate_setlist_slot(uuid,uuid,text,jsonb) to authenticated;

-- Preserve the presenter field contract while serializing it with workspace saves.
create function public.save_setlist_presentation_settings(p_team_id uuid,p_setlist_id uuid,p_settings jsonb)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_revision bigint;
begin
  perform private.lock_workspace_members(p_team_id);
  if not private.has_workspace_permission(p_team_id,'setlists.manage') then
    raise exception 'Setlist editing unavailable' using errcode='42501';
  end if;
  if coalesce(jsonb_typeof(p_settings),'')<>'object' or octet_length(p_settings::text)>2097152 then
    raise exception 'Invalid presentation settings' using errcode='22023';
  end if;
  perform 1 from public.setlists where id=p_setlist_id and team_id=p_team_id and deleted_at is null for update;
  if not found then raise exception 'Setlist editing unavailable' using errcode='42501'; end if;
  update public.setlists set presentation_settings=p_settings where id=p_setlist_id and team_id=p_team_id
    returning sync_revision into v_revision;
  return v_revision;
end;
$$;
revoke all on function public.save_setlist_presentation_settings(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_setlist_presentation_settings(uuid,uuid,jsonb) to authenticated;

create or replace function public.delete_setlist_cascade(p_setlist_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_team uuid; v_event uuid; v_status text;
begin
  select team_id into v_team from public.setlists where id=p_setlist_id;
  perform private.lock_workspace_members(v_team);
  if not private.has_workspace_permission(v_team,'setlists.manage') then
    raise exception 'setlist cannot be deleted' using errcode='42501';
  end if;
  select event_id into v_event from public.setlists where id=p_setlist_id and team_id=v_team;
  if not found then raise exception 'setlist cannot be deleted' using errcode='42501'; end if;
  -- Siblings survive, but their event FK is cleared by the historical contract.
  perform 1 from public.setlists where team_id=v_team and (id=p_setlist_id or event_id=v_event) order by id for update;
  if v_event is not null then
    select approval_status into v_status from public.events where id=v_event and team_id=v_team for update;
    if not found or (v_status<>'approved' and not private.has_team_role(v_team,array['owner','admin']::public.team_role[])) then
      raise exception 'Linked event cannot be deleted' using errcode='42501';
    end if;
  end if;
  delete from public.setlists where id=p_setlist_id and team_id=v_team;
  if v_event is not null then delete from public.events where id=v_event and team_id=v_team; end if;
end;
$$;
revoke all on function public.delete_setlist_cascade(uuid) from public,anon;
grant execute on function public.delete_setlist_cascade(uuid) to authenticated;

-- Existing bounded batch RPC; member and workspace locks precede parents.
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
  and deleted_at is null;
  perform private.lock_workspace_members(setlist_team);
  perform 1 from public.setlists where id=p_setlist_id and team_id=setlist_team and deleted_at is null for update;
  if not found then raise exception 'setlist unavailable' using errcode='42501'; end if;

  if setlist_team is null
     or not private.has_workspace_permission(setlist_team,'setlists.manage') then
    raise exception using errcode = '42501', message = 'setlist cannot be modified';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_songs) item
    left join public.songs s
      on s.id = (item->>'song_id')::uuid
     and s.team_id = setlist_team
    where s.id is null or s.deleted_at is not null
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

-- Existing bounded batch RPC; member and workspace locks precede parents.
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
  and deleted_at is null;
  perform private.lock_workspace_members(setlist_team);
  perform 1 from public.setlists where id=p_setlist_id and team_id=setlist_team and deleted_at is null for update;
  if not found then raise exception 'setlist unavailable' using errcode='42501'; end if;

  if setlist_team is null
     or not private.has_workspace_permission(setlist_team,'setlists.manage') then
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

-- Child deletion touches aggregate parents, so parents must precede song locks.
create or replace function public.delete_song_cascade(p_song_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_team uuid;
begin
  select team_id into v_team from public.songs where id=p_song_id;
  perform private.lock_workspace_members(v_team);
  if not private.has_team_role(v_team,array['owner','admin']::public.team_role[]) then
    raise exception 'song cannot be permanently deleted' using errcode='42501';
  end if;
  perform 1 from public.setlists where team_id=v_team and id in
    (select setlist_id from public.setlist_songs where song_id=p_song_id) order by id for update;
  perform 1 from public.songs where id=p_song_id and team_id=v_team for update;
  if not found then raise exception 'song cannot be permanently deleted' using errcode='42501'; end if;
  delete from public.setlist_songs where song_id=p_song_id;
  delete from public.song_favorites where song_id=p_song_id;
  delete from public.songs where id=p_song_id and team_id=v_team;
end;
$$;
revoke all on function public.delete_song_cascade(uuid) from public,anon;
grant execute on function public.delete_song_cascade(uuid) to authenticated;
-- Source: 20261006090000_sync_snapshot_visibility.sql
-- Private drafts must not become readable through current or historical sync.
create function private.sync_snapshot_visible(p_team uuid,p_type text,p_id uuid,p_operation text,p_payload jsonb)
returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and private.is_approved_member(p_team) and case p_type
  when 'event' then
    (private.has_team_role(p_team,array['owner','admin']::public.team_role[]) or p_payload->>'created_by'=auth.uid()::text
      or (p_payload->>'approval_status'='approved' and (p_operation='delete' or exists(select 1 from public.events e where e.id=p_id and e.team_id=p_team and e.approval_status='approved'))))
  when 'song' then p_payload->>'status'='approved' and
    (p_operation='delete' or exists(select 1 from public.songs s where s.id=p_id and s.team_id=p_team and s.status='approved'))
  when 'setlist' then p_operation='delete' or exists(select 1 from public.setlists s where s.id=p_id and s.team_id=p_team)
  when 'setlist_song' then p_operation='delete' or exists(select 1 from public.setlist_songs ss join public.setlists s on s.id=ss.setlist_id where ss.id=p_id and s.team_id=p_team)
  else false end;
$$;
revoke all on function private.sync_snapshot_visible(uuid,text,uuid,text,jsonb) from public,anon;
grant execute on function private.sync_snapshot_visible(uuid,text,uuid,text,jsonb) to authenticated;
drop policy if exists "Active members can read worship sync changes" on public.worship_sync_changes;
create policy "Visible snapshots only" on public.worship_sync_changes for select to authenticated
using(private.sync_snapshot_visible(team_id,entity_type,entity_id,operation,payload));
-- New sync writes come from the guarded row triggers, never client snapshots.
revoke insert,update,delete on public.worship_sync_changes from authenticated,anon;
-- Tombstones carry identity and visibility metadata, never deleted draft text.
update public.worship_sync_changes set payload=jsonb_build_object('id',entity_id,'team_id',team_id,'sync_revision',revision,
  'deleted_at',payload->'deleted_at','approval_status',payload->'approval_status','status',payload->'status',
  'created_by',payload->'created_by','setlist_id',payload->'setlist_id') where operation='delete';
-- Source: 20261006100000_song_library_search_sort.sql
-- Search, favorite filtering and popularity ordering precede pagination.
create function public.search_songs(p_team_id uuid,p_query text,p_favorites boolean default false,p_sort text default 'title')
returns setof public.songs language plpgsql stable security invoker set search_path='' as $$
declare v_query text:=lower(trim(coalesce(p_query,'')));
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  if length(v_query)>160 or p_sort not in ('title','playCount') then
    raise exception 'Invalid song search' using errcode='22023';
  end if;
  return query select s.* from public.songs s
    where s.team_id=p_team_id and s.deleted_at is null and s.status='approved'
      and (v_query='' or position(v_query in lower(s.title))>0 or position(v_query in lower(s.artist))>0
        or exists(select 1 from unnest(s.tags) tag where position(v_query in lower(tag))>0))
      and (not p_favorites or exists(select 1 from public.song_favorites f join public.team_members tm on tm.id=f.team_member_id
        where f.song_id=s.id and tm.team_id=p_team_id and tm.profile_id=auth.uid() and tm.status='active'))
    order by case when p_sort='playCount' then
      (select count(*) from public.setlist_songs ss join public.setlists sl on sl.id=ss.setlist_id
        where ss.song_id=s.id and ss.deleted_at is null and sl.team_id=p_team_id and sl.deleted_at is null) end desc,
      s.title,s.id;
end;
$$;
revoke all on function public.search_songs(uuid,text,boolean,text) from public,anon;
grant execute on function public.search_songs(uuid,text,boolean,text) to authenticated;
-- Source: 20261006110000_global_event_search.sql
-- Cast enum values explicitly; PostgREST ILIKE cannot search an enum column.
create function public.search_events(p_team_id uuid,p_query text)
returns setof public.events language plpgsql stable security invoker set search_path='' as $$
declare v_query text:=lower(trim(coalesce(p_query,'')));
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then
    raise exception 'Active team membership required' using errcode='42501';
  end if;
  if length(v_query)>160 then raise exception 'Search is too long' using errcode='22023'; end if;
  return query select e.* from public.events e where e.team_id=p_team_id and e.deleted_at is null
    and (v_query='' or position(v_query in lower(e.name))>0 or position(v_query in lower(coalesce(e.location,'')))>0
      or position(v_query in lower(e.type::text))>0 or position(v_query in e.event_date::text)>0);
end;
$$;
revoke all on function public.search_events(uuid,text) from public,anon;
grant execute on function public.search_events(uuid,text) to authenticated;
commit;
