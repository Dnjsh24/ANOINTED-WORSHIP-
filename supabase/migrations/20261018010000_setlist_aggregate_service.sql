-- DRAFT: shared website/mobile aggregate primitive. No hosted application authorized.
-- Public website signatures and grants stay compatible. Mobile RPC/receipts follow separately.
begin;

create function private.assert_setlist_aggregate_base(p_team uuid,p_setlist uuid,p_base jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_current public.setlists%rowtype; v_actual jsonb; v_original jsonb;
begin
 select * into v_current from public.setlists where id=p_setlist and team_id=p_team and deleted_at is null for update;
 if not found then raise exception 'Setlist unavailable' using errcode='42501'; end if;
 if jsonb_typeof(p_base) is distinct from 'object' or jsonb_typeof(p_base->'record') is distinct from 'object'
   or jsonb_typeof(p_base->'slots') is distinct from 'array' then raise exception 'Original setlist aggregate required' using errcode='22023'; end if;
 perform 1 from public.setlist_songs where setlist_id=p_setlist order by id for update;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) into v_actual from public.setlist_songs s where setlist_id=p_setlist and deleted_at is null;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) into v_original from jsonb_populate_recordset(null::public.setlist_songs,p_base->'slots') s;
 if to_jsonb(v_current) is distinct from to_jsonb(jsonb_populate_record(null::public.setlists,p_base->'record')) or v_actual is distinct from v_original then
  raise exception 'Setlist or song slots changed. Keep the original draft.' using errcode='40001';
 end if;
end;
$$;
revoke all on function private.assert_setlist_aggregate_base(uuid,uuid,jsonb) from public,anon,authenticated;

create function private.check_setlist_aggregate_intent(p_team uuid,p_setlist uuid,p_event uuid,p_songs uuid[],p_template uuid,p_intent jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_slot jsonb; v_original public.setlist_songs%rowtype; v_source uuid; v_local uuid;
 v_target uuid; v_targets uuid[]:='{}'; v_locals uuid[]:='{}'; v_song_ids uuid[]:='{}'; v_key text; v_value jsonb; v_before jsonb;
 v_columns jsonb:='{"assignedKey":"assigned_key","notes":"notes","bandNotes":"band_notes","arrangement":"arrangement","leadMemberId":"lead_member_id","youtubeUrl":"youtube_url","slideSettings":"slide_settings"}';
 v_template jsonb; v_placeholder jsonb; v_ids uuid[]:='{}';
begin
 if auth.uid() is null or not private.has_workspace_permission(p_team,'setlists.manage') then raise exception 'Setlist cannot be saved' using errcode='42501'; end if;
 if jsonb_typeof(p_intent) is distinct from 'object' or p_intent-array['setlistId','baseValue','slots','template']<>'{}'::jsonb
   or not(p_intent ?& array['setlistId','baseValue','slots','template']) or jsonb_typeof(p_intent->'setlistId') is distinct from 'string'
   or jsonb_typeof(p_intent->'slots') is distinct from 'array' or jsonb_array_length(p_intent->'slots')>200 then raise exception 'Invalid setlist aggregate intent' using errcode='22023'; end if;
 v_target:=(p_intent->>'setlistId')::uuid;
 if p_setlist is null then
  if p_intent->'baseValue'<>'null'::jsonb or exists(select 1 from public.setlists where id=v_target) then raise exception 'New setlist identity is unavailable' using errcode='40001'; end if;
 else
  if p_setlist<>v_target then raise exception 'Setlist unavailable' using errcode='42501'; end if;
  perform private.assert_setlist_aggregate_base(p_team,p_setlist,p_intent->'baseValue');
 end if;
 for v_slot in select value from jsonb_array_elements(p_intent->'slots') loop
  if jsonb_typeof(v_slot) is distinct from 'object' or v_slot-array['localId','sourceSlotId','songId','assignedKey','notes','bandNotes','arrangement','leadMemberId','youtubeUrl','slideSettings']<>'{}'::jsonb
    or not(v_slot ?& array['localId','sourceSlotId','songId','assignedKey','notes','bandNotes','arrangement','leadMemberId','youtubeUrl','slideSettings'])
    or jsonb_typeof(v_slot->'localId') is distinct from 'string' or jsonb_typeof(v_slot->'songId') is distinct from 'string'
    or jsonb_typeof(v_slot->'sourceSlotId') not in ('string','null') then raise exception 'Invalid song slot identity' using errcode='22023'; end if;
  v_local:=(v_slot->>'localId')::uuid; v_source:=(v_slot->>'sourceSlotId')::uuid;
  v_target:=coalesce(v_source,v_local); v_original:=null;
  if v_local=(p_intent->>'setlistId')::uuid or v_target=(p_intent->>'setlistId')::uuid or v_local=any(v_locals) or v_target=any(v_targets)
    or exists(select 1 from public.setlist_songs where id=v_local and id is distinct from v_source) then raise exception 'Song slot IDs must stay distinct' using errcode='22023'; end if;
  if v_source is not null then
   select * into v_original from public.setlist_songs where id=v_source and setlist_id=p_setlist and deleted_at is null;
   if not found or v_original.song_id<>(v_slot->>'songId')::uuid then raise exception 'Retained song slot changed identity' using errcode='22023'; end if;
  elsif exists(select 1 from public.setlist_songs where id=v_local) then raise exception 'New song slot ID is unavailable' using errcode='40001'; end if;
  v_locals:=array_append(v_locals,v_local); v_targets:=array_append(v_targets,v_target); v_song_ids:=array_append(v_song_ids,(v_slot->>'songId')::uuid);
  for v_key in select jsonb_object_keys(v_columns) loop
   v_value:=v_slot->v_key; v_before:=to_jsonb(v_original)->(v_columns->>v_key);
   if v_source is not null and v_value is not distinct from v_before then continue; end if;
   if v_key='slideSettings' then
    if (v_source is not null or v_value<>'null'::jsonb) and jsonb_typeof(v_value)<>'object' then raise exception 'Invalid changed slide settings' using errcode='22023'; end if;
   elsif v_key='assignedKey' then
    if jsonb_typeof(v_value)<>'string' or length(trim(v_slot->>v_key)) not between 1 and 3 then raise exception 'Invalid changed song key' using errcode='22023'; end if;
   elsif v_key='leadMemberId' then
    if v_value<>'null'::jsonb then
     if jsonb_typeof(v_value)<>'string' then raise exception 'Invalid song lead' using errcode='22023'; end if;
     perform 1 from public.team_members where id=(v_slot->>v_key)::uuid and team_id=p_team and status='active' for share;
     if not found then raise exception 'Lead unavailable' using errcode='22023'; end if;
    end if;
   elsif v_value<>'null'::jsonb and (jsonb_typeof(v_value)<>'string' or length(v_slot->>v_key)>case v_key when 'notes' then 2000 when 'youtubeUrl' then 500 else 4000 end) then
    raise exception 'Invalid changed song metadata' using errcode='22023';
   end if;
  end loop;
 end loop;
 if v_song_ids is distinct from p_songs then raise exception 'Song order does not match the aggregate intent' using errcode='22023'; end if;
 v_template:=p_intent->'template';
 if p_template is null then
  if v_template<>'null'::jsonb then raise exception 'Unexpected template' using errcode='22023'; end if;
 else
  if p_setlist is not null or jsonb_typeof(v_template) is distinct from 'object' or v_template-array['base','placeholders']<>'{}'::jsonb
    or jsonb_typeof(v_template->'base') is distinct from 'object' or (v_template->'base'->>'id')::uuid is distinct from p_template
    or (v_template->'base'->>'team_id')::uuid is distinct from p_team or jsonb_typeof(v_template->'base'->'slots') is distinct from 'array'
    or jsonb_typeof(v_template->'placeholders') is distinct from 'array'
    or jsonb_array_length(v_template->'placeholders')<>jsonb_array_length(v_template->'base'->'slots')
    or jsonb_array_length(v_template->'placeholders')+cardinality(p_songs)>200 then raise exception 'Invalid captured template' using errcode='22023'; end if;
  v_ids:=v_locals||v_targets||array[(p_intent->>'setlistId')::uuid];
  for v_placeholder in select value from jsonb_array_elements(v_template->'placeholders') loop
   if jsonb_typeof(v_placeholder) is distinct from 'object' or v_placeholder-array['slotId','songId']<>'{}'::jsonb
     or jsonb_typeof(v_placeholder->'slotId') is distinct from 'string' or jsonb_typeof(v_placeholder->'songId') is distinct from 'string' then raise exception 'Invalid template identities' using errcode='22023'; end if;
   v_local:=(v_placeholder->>'slotId')::uuid; v_target:=(v_placeholder->>'songId')::uuid;
   if v_local=v_target or v_local=any(v_ids) or v_target=any(v_ids) or v_target=any(v_song_ids)
     or exists(select 1 from public.setlist_songs where id=v_local) or exists(select 1 from public.songs where id=v_target) then raise exception 'Template identity is already used' using errcode='40001'; end if;
   v_ids:=v_ids||array[v_local,v_target];
  end loop;
 end if;
end;
$$;
revoke all on function private.check_setlist_aggregate_intent(uuid,uuid,uuid,uuid[],uuid,jsonb) from public,anon,authenticated;

create function private.apply_setlist_slot_intent(p_setlist uuid,p_slots jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_slot jsonb; v_offset integer; v_index integer:=0; v_ids uuid[]; v_original public.setlist_songs%rowtype;
begin
 select coalesce(array_agg(coalesce((s->>'sourceSlotId')::uuid,(s->>'localId')::uuid)),'{}'::uuid[]) into v_ids from jsonb_array_elements(p_slots) s;
 select coalesce(max(song_order),0)+10000 into v_offset from public.setlist_songs where setlist_id=p_setlist;
 update public.setlist_songs set song_order=song_order+v_offset where setlist_id=p_setlist;
 delete from public.setlist_songs where setlist_id=p_setlist and not(id=any(v_ids));
 for v_slot in select value from jsonb_array_elements(p_slots) loop
  v_index:=v_index+1;
  if v_slot->>'sourceSlotId' is not null then
   select * into strict v_original from public.setlist_songs where id=(v_slot->>'sourceSlotId')::uuid and setlist_id=p_setlist;
   update public.setlist_songs set song_order=v_index,
     assigned_key=case when v_original.assigned_key=v_slot->>'assignedKey' then v_original.assigned_key else trim(v_slot->>'assignedKey') end,
     notes=v_slot->>'notes',band_notes=v_slot->>'bandNotes',arrangement=v_slot->>'arrangement',lead_member_id=(v_slot->>'leadMemberId')::uuid,
     youtube_url=v_slot->>'youtubeUrl',slide_settings=case when to_jsonb(v_original)->'slide_settings' is not distinct from v_slot->'slideSettings'
       then v_original.slide_settings else nullif(v_slot->'slideSettings','null'::jsonb) end
   where id=v_original.id and setlist_id=p_setlist;
  else
   insert into public.setlist_songs(id,setlist_id,song_id,song_order,assigned_key,notes,band_notes,arrangement,lead_member_id,youtube_url,slide_settings)
   values((v_slot->>'localId')::uuid,p_setlist,(v_slot->>'songId')::uuid,v_index,trim(v_slot->>'assignedKey'),v_slot->>'notes',v_slot->>'bandNotes',
     v_slot->>'arrangement',(v_slot->>'leadMemberId')::uuid,v_slot->>'youtubeUrl',nullif(v_slot->'slideSettings','null'::jsonb));
  end if;
 end loop;
end;
$$;
revoke all on function private.apply_setlist_slot_intent(uuid,jsonb) from public,anon,authenticated;

create function private.save_setlist_workspace_core(
  p_team_id uuid, p_setlist_id uuid, p_event_id uuid, p_details jsonb, p_song_ids uuid[], p_template_id uuid, p_expected_revision bigint, p_mobile jsonb default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_setlist_id, (p_mobile->>'setlistId')::uuid, gen_random_uuid());
  v_event_id uuid := p_event_id;
  v_setlist public.setlists%rowtype;
  v_slots jsonb;
  v_slot jsonb;
  v_song_ids uuid[] := coalesce(p_song_ids, '{}'::uuid[]);
  v_existing_ids uuid[];
  v_song_id uuid;
  v_offset integer;
  v_template_notes text[] := '{}'::text[];
  v_native_slots jsonb; v_template public.setlist_templates%rowtype; v_placeholder jsonb; v_template_index integer:=0;
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
  if p_mobile is not null then
    if p_details->'update_event' is distinct from 'false'::jsonb then
      raise exception 'A mobile setlist save cannot change Timeline events' using errcode='22023';
    end if;
    perform private.check_setlist_aggregate_intent(p_team_id,p_setlist_id,p_event_id,p_song_ids,p_template_id,p_mobile);
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
  if p_mobile is not null then
    perform 1 from public.songs where id=any(p_song_ids) order by id for share;
    if exists(select 1 from unnest(p_song_ids) sid where not exists(select 1 from public.songs where id=sid and team_id=p_team_id and deleted_at is null)) then
      raise exception 'Songs must belong to the active team' using errcode='22023';
    end if;
  end if;
  if p_mobile is not null and p_template_id is not null then
    select * into v_template from public.setlist_templates where id=p_template_id and team_id=p_team_id for share;
    if not found or to_jsonb(v_template) is distinct from to_jsonb(jsonb_populate_record(null::public.setlist_templates,p_mobile->'template'->'base')) then
      raise exception 'Template changed. Keep the original draft.' using errcode='40001';
    end if;
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
        v_placeholder:=p_mobile->'template'->'placeholders'->v_template_index;
        v_template_index:=v_template_index+1;
        insert into public.songs (id, team_id, title, artist, original_key, lyrics_chords, created_by)
        values (coalesce((v_placeholder->>'songId')::uuid,gen_random_uuid()), p_team_id, '[Slot: ' || coalesce(nullif(v_slot->>'label',''), nullif(v_slot->>'tag',''), 'Any') || ']',
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
  if p_mobile is not null then
    v_native_slots:='[]'::jsonb;
    for v_index in 1..v_template_index loop
      v_placeholder:=p_mobile->'template'->'placeholders'->(v_index-1);
      v_native_slots:=v_native_slots||jsonb_build_array(jsonb_build_object('localId',v_placeholder->'slotId','sourceSlotId',null,
        'songId',v_placeholder->'songId','assignedKey','C','notes',v_template_notes[v_index],
        'bandNotes',null,'arrangement',null,'leadMemberId',null,'youtubeUrl',null,'slideSettings',null));
    end loop;
    perform private.apply_setlist_slot_intent(v_id,v_native_slots||(p_mobile->'slots'));
  else
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
  end if;
  insert into public.setlist_change_log (setlist_id, team_id, changed_by, change_type, summary, snapshot)
  values (v_id, p_team_id, auth.uid(), case when p_setlist_id is null then 'created' else 'updated' end,
    case when p_setlist_id is null then 'Created setlist.' else 'Updated setlist details.' end, p_details);
  return v_id;
end;
$$;
revoke all on function private.save_setlist_workspace_core(uuid,uuid,uuid,jsonb,uuid[],uuid,bigint,jsonb) from public,anon,authenticated;

create or replace function public.save_setlist_workspace(
 p_team_id uuid,p_setlist_id uuid,p_event_id uuid,p_details jsonb,p_song_ids uuid[],p_template_id uuid,p_expected_revision bigint default null
) returns uuid language plpgsql security definer set search_path='' as $$
begin
 return private.save_setlist_workspace_core(p_team_id,p_setlist_id,p_event_id,p_details,p_song_ids,p_template_id,p_expected_revision,null);
end;
$$;
-- Existing public execute grants are retained by CREATE OR REPLACE.

create function private.delete_setlist_aggregate(p_team uuid,p_setlist uuid,p_base jsonb,p_cascade jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_record public.setlists%rowtype; v_event public.events%rowtype; v_actual jsonb; v_requested jsonb; v_sibling jsonb;
begin
 if auth.uid() is null or not private.has_workspace_permission(p_team,'setlists.manage') then raise exception 'Setlist cannot be deleted' using errcode='42501'; end if;
 perform private.lock_workspace_members(p_team);
 if not private.has_workspace_permission(p_team,'setlists.manage') then raise exception 'Setlist cannot be deleted' using errcode='42501'; end if;
 if jsonb_typeof(p_cascade) is distinct from 'object' or p_cascade-array['deleteLinkedEvent','unlinkSetlists']<>'{}'::jsonb
   or jsonb_typeof(p_cascade->'deleteLinkedEvent') is distinct from 'boolean' or jsonb_typeof(p_cascade->'unlinkSetlists') is distinct from 'array' then raise exception 'Review the complete deletion scope' using errcode='22023'; end if;
 select * into v_record from public.setlists where id=p_setlist and team_id=p_team and deleted_at is null;
 if not found then raise exception 'Setlist unavailable' using errcode='42501'; end if;
 perform 1 from public.setlists where team_id=p_team and (id=p_setlist or (v_record.event_id is not null and event_id=v_record.event_id)) order by id for update;
 perform private.assert_setlist_aggregate_base(p_team,p_setlist,p_base);
 for v_sibling in select value from jsonb_array_elements(p_cascade->'unlinkSetlists') loop
  if jsonb_typeof(v_sibling) is distinct from 'object' or v_sibling-array['id','revision']<>'{}'::jsonb
    or jsonb_typeof(v_sibling->'id') is distinct from 'string' or jsonb_typeof(v_sibling->'revision') is distinct from 'number'
    or (v_sibling->>'revision')::numeric not between 0 and 9007199254740991 or (v_sibling->>'revision')::numeric<>trunc((v_sibling->>'revision')::numeric) then raise exception 'Invalid linked setlist base' using errcode='22023'; end if;
  perform (v_sibling->>'id')::uuid;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',sync_revision) order by id),'[]'::jsonb) into v_actual
   from public.setlists where team_id=p_team and id<>p_setlist and v_record.event_id is not null and event_id=v_record.event_id;
 select coalesce(jsonb_agg(value order by (value->>'id')::uuid),'[]'::jsonb) into v_requested from jsonb_array_elements(p_cascade->'unlinkSetlists');
 if v_actual is distinct from v_requested or p_cascade->'deleteLinkedEvent' is distinct from to_jsonb(v_record.event_id is not null) then raise exception 'Deletion scope changed. Keep the original draft.' using errcode='40001'; end if;
 if v_record.event_id is not null then
  select * into v_event from public.events where id=v_record.event_id and team_id=p_team for update;
  if not found or jsonb_typeof(p_base->'linkedEvent') is distinct from 'object'
    or to_jsonb(v_event) is distinct from to_jsonb(jsonb_populate_record(null::public.events,p_base->'linkedEvent')) then raise exception 'Linked event changed. Review deletion again.' using errcode='40001'; end if;
 end if;
 perform public.delete_setlist_cascade(p_setlist);
end;
$$;
revoke all on function private.delete_setlist_aggregate(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
commit;
