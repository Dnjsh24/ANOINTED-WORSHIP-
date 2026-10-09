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
