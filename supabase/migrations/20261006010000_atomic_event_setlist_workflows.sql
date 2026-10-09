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
