-- Additive mobile transport. Existing workspace writers already increment revisions.
begin;

create table public.mobile_annotations (
  id uuid primary key, team_id uuid not null references public.teams(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  setlist_id uuid references public.setlists(id) on delete cascade,
  slot_id uuid references public.setlist_songs(id) on delete cascade,
  notes jsonb not null default '[]', drawing text, sync_revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  check ((setlist_id is null) = (slot_id is null)),
  check (jsonb_typeof(notes)='array' and jsonb_array_length(notes)<=100),
  check (drawing is null or (length(drawing)<=180000 and drawing like 'data:image/png;base64,%'))
);
create index mobile_annotations_actor_team_idx on public.mobile_annotations(actor_id,team_id);
create index mobile_annotations_song_idx on public.mobile_annotations(song_id);
create index mobile_annotations_setlist_idx on public.mobile_annotations(setlist_id);
create index mobile_annotations_slot_idx on public.mobile_annotations(slot_id);
create trigger mobile_annotations_revision before insert or update on public.mobile_annotations for each row execute function private.bump_workspace_sync_revision();

create table public.mobile_deleted_records (
  team_id uuid not null references public.teams(id) on delete cascade, entity_type text not null,
  entity_id uuid not null, revision bigint not null, actor_id uuid references public.profiles(id) on delete cascade,
  primary key(team_id,entity_type,entity_id)
);
create index mobile_deleted_records_actor_idx on public.mobile_deleted_records(actor_id);
create table public.mobile_command_receipts (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade, command_id uuid not null,
  command jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
  primary key(actor_id,team_id,command_id)
);
-- Retain downloaded bases beyond manifest expiry: an offline draft may live for months.
create table public.mobile_record_bases (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  entity_type text not null, entity_id uuid not null, revision bigint not null, record jsonb not null,
  primary key(actor_id,team_id,entity_type,entity_id,revision)
);
create table public.mobile_download_manifests (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade, selection jsonb not null,
  expires_at timestamptz not null default now()+interval '30 minutes'
);
create index mobile_download_manifests_actor_team_idx on public.mobile_download_manifests(actor_id,team_id);
create index mobile_download_manifests_team_idx on public.mobile_download_manifests(team_id);
create table public.mobile_download_records (
  manifest_id uuid not null references public.mobile_download_manifests(id) on delete cascade,
  entity_type text not null, entity_id uuid not null, record jsonb not null,
  primary key(manifest_id,entity_type,entity_id)
);

alter table public.mobile_annotations enable row level security;
alter table public.mobile_deleted_records enable row level security;
alter table public.mobile_command_receipts enable row level security;
alter table public.mobile_record_bases enable row level security;
alter table public.mobile_download_manifests enable row level security;
alter table public.mobile_download_records enable row level security;
revoke all on public.mobile_annotations,public.mobile_deleted_records,public.mobile_command_receipts,public.mobile_record_bases,public.mobile_download_manifests,public.mobile_download_records from public,anon,authenticated;
grant select on public.mobile_annotations,public.mobile_deleted_records,public.mobile_command_receipts,public.mobile_record_bases,public.mobile_download_manifests,public.mobile_download_records to authenticated;
create policy mobile_annotations_read on public.mobile_annotations for select to authenticated using(actor_id=(select auth.uid()) and private.is_approved_member(team_id));
create policy mobile_deleted_records_read on public.mobile_deleted_records for select to authenticated using((actor_id is null or actor_id=(select auth.uid())) and private.is_approved_member(team_id));
create policy mobile_command_receipts_read on public.mobile_command_receipts for select to authenticated using(actor_id=(select auth.uid()) and private.is_approved_member(team_id));
create policy mobile_record_bases_read on public.mobile_record_bases for select to authenticated using(actor_id=(select auth.uid()) and private.is_approved_member(team_id));
create policy mobile_manifests_read on public.mobile_download_manifests for select to authenticated using(actor_id=(select auth.uid()) and private.is_approved_member(team_id));
create policy mobile_download_records_read on public.mobile_download_records for select to authenticated using(exists(select 1 from public.mobile_download_manifests m where m.id=manifest_id and m.actor_id=(select auth.uid()) and private.is_approved_member(m.team_id)));

create function private.mobile_track_deletion() returns trigger language plpgsql security definer set search_path='' as $$
declare v_row jsonb; v_team uuid; v_type text; v_revision bigint;
begin
  v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_type:=case tg_table_name when 'songs' then 'song' when 'setlists' then 'setlist' when 'events' then 'event' when 'setlist_songs' then 'arrangement' when 'dance_notes' then 'dance' else 'annotation' end;
  if tg_table_name='setlist_songs' then select team_id into v_team from public.setlists where id=(v_row->>'setlist_id')::uuid;
  else v_team:=(v_row->>'team_id')::uuid; end if;
  if v_team is null then return old; end if;
  v_revision:=coalesce((v_row->>'sync_revision')::bigint,(v_row->>'shared_edit_revision')::bigint,0)+case when tg_op='DELETE' then 1 else 0 end;
  -- FK cascades run after the parent row disappears. Preserve each child tombstone
  -- while its parent still supplies the team boundary.
  if tg_op='DELETE' and tg_table_name='setlists' then
    insert into public.mobile_deleted_records(team_id,entity_type,entity_id,revision,actor_id)
      select v_team,'arrangement',id,sync_revision+1,null from public.setlist_songs where setlist_id=old.id
      on conflict(team_id,entity_type,entity_id) do update set revision=greatest(public.mobile_deleted_records.revision,excluded.revision);
  end if;
  if tg_op='DELETE' or v_row->>'deleted_at' is not null then
    insert into public.mobile_deleted_records(team_id,entity_type,entity_id,revision,actor_id)
      values(v_team,v_type,(v_row->>'id')::uuid,v_revision,(v_row->>'actor_id')::uuid)
      on conflict(team_id,entity_type,entity_id) do update set revision=greatest(public.mobile_deleted_records.revision,excluded.revision);
  else delete from public.mobile_deleted_records where team_id=v_team and entity_type=v_type and entity_id=(v_row->>'id')::uuid; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function private.mobile_track_deletion() from public,anon,authenticated;
create trigger mobile_track_deletion after insert or update or delete on public.songs for each row execute function private.mobile_track_deletion();
create trigger mobile_track_deletion after insert or update on public.setlists for each row execute function private.mobile_track_deletion();
create trigger mobile_track_deletion_before before delete on public.setlists for each row execute function private.mobile_track_deletion();
create trigger mobile_track_deletion after insert or update or delete on public.events for each row execute function private.mobile_track_deletion();
create trigger mobile_track_deletion before delete on public.setlist_songs for each row execute function private.mobile_track_deletion();
create trigger mobile_track_deletion_update after insert or update on public.setlist_songs for each row execute function private.mobile_track_deletion();
create trigger mobile_track_deletion after insert or update or delete on public.dance_notes for each row execute function private.mobile_track_deletion();
create trigger mobile_track_deletion after insert or update or delete on public.mobile_annotations for each row execute function private.mobile_track_deletion();

create function private.mobile_record(p_team uuid,p_type text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb; v_row jsonb; v_values jsonb; v_revision bigint; v_kind text;
begin
  if auth.uid() is null or not private.is_approved_member(p_team) then raise exception 'Active team membership required' using errcode='42501'; end if;
  select revision into v_revision from public.mobile_deleted_records where team_id=p_team and entity_type=p_type and entity_id=p_id and (actor_id is null or actor_id=auth.uid());
  if found then return jsonb_build_object('entityType',p_type,'id',p_id,'revision',v_revision,'value',null,'deleted',true); end if;
  case p_type
  when 'annotation' then
    select to_jsonb(a),a.sync_revision into v_row,v_revision from public.mobile_annotations a where id=p_id and team_id=p_team and actor_id=auth.uid();
    v_values:=v_row-array['id','team_id','actor_id','sync_revision','updated_at'];
  when 'event' then
    select to_jsonb(e),e.sync_revision into v_row,v_revision from public.events e where id=p_id and team_id=p_team and deleted_at is null
      and (approval_status='approved' or created_by=auth.uid() or private.has_team_role(p_team,array['owner','admin']::public.team_role[]));
    if v_row is not null then
      v_values:=jsonb_build_object('name',v_row->'name','type',v_row->'type','event_date',v_row->'event_date','starts_at',v_row->'starts_at','ends_at',v_row->'ends_at','location',v_row->'location','description',v_row->'description','rehearsal_date',v_row->'rehearsal_date','rehearsal_time',v_row->'rehearsal_time','rehearsal_end_time',v_row->'rehearsal_end_time','assignments',
        case when v_row->>'approval_status'='pending' then v_row->'requested_assignments' else coalesce((select jsonb_agg(jsonb_build_object('team_member_id',team_member_id,'assignment',assignment) order by assignment,team_member_id) from public.event_assignments where event_id=p_id),'[]'::jsonb) end);
    end if;
  else
    v_kind:=case p_type when 'arrangement' then 'song_slot' when 'dance' then 'choreography' else p_type end;
    -- Resolve the team before calling the definer snapshot helper.
    if p_type='song' then select to_jsonb(s) into v_row from public.songs s where id=p_id and team_id=p_team and deleted_at is null and status='approved';
    elsif p_type='setlist' then select to_jsonb(s) into v_row from public.setlists s where id=p_id and team_id=p_team and deleted_at is null;
    elsif p_type='arrangement' then select to_jsonb(s) into v_row from public.setlist_songs s join public.setlists l on l.id=s.setlist_id where s.id=p_id and l.team_id=p_team and l.deleted_at is null and s.deleted_at is null;
    elsif p_type='dance' then select to_jsonb(d) into v_row from public.dance_notes d where id=p_id and team_id=p_team;
    else raise exception 'Unknown mobile entity' using errcode='22023'; end if;
    if v_row is not null then
      v_snapshot:=private.shared_edit_target(v_kind,p_id,false); v_revision:=(v_snapshot->>'revision')::bigint; v_values:=v_snapshot->'values';
      if p_type='setlist' then v_values:=v_values || jsonb_build_object('event_id',v_row->'event_id');
      elsif p_type='arrangement' then v_values:=v_values || jsonb_build_object('setlist_id',v_row->'setlist_id','song_id',v_row->'song_id','song_order',v_row->'song_order');
      elsif p_type='dance' then v_values:=v_values || jsonb_build_object('song_id',v_row->'song_id','event_id',v_row->'event_id'); end if;
    end if;
  end case;
  if v_values is null then return null; end if;
  return jsonb_build_object('entityType',p_type,'id',p_id,'revision',v_revision,'value',v_values);
end;
$$;
revoke all on function private.mobile_record(uuid,text,uuid) from public,anon,authenticated;

-- Stored pages and bases do not grant permanent access after a visibility change.
create function private.mobile_can_read_record(p_team uuid,p_type text,p_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not private.is_approved_member(p_team) then return false; end if;
  return private.mobile_record(p_team,p_type,p_id) is not null;
end;
$$;
revoke all on function private.mobile_can_read_record(uuid,text,uuid) from public,anon;
grant execute on function private.mobile_can_read_record(uuid,text,uuid) to authenticated;
alter policy mobile_record_bases_read on public.mobile_record_bases using(actor_id=(select auth.uid()) and private.mobile_can_read_record(team_id,entity_type,entity_id));
alter policy mobile_command_receipts_read on public.mobile_command_receipts using(actor_id=(select auth.uid()) and private.mobile_can_read_record(team_id,command->>'entityType',(command->>'entityId')::uuid));
alter policy mobile_download_records_read on public.mobile_download_records using(exists(select 1 from public.mobile_download_manifests m where m.id=manifest_id and m.actor_id=(select auth.uid()) and m.expires_at>now() and private.mobile_can_read_record(m.team_id,entity_type,entity_id)));

create function private.validate_mobile_value(p_type text,p_value jsonb) returns void language plpgsql set search_path='' as $$
declare v_keys text[]; v_core jsonb; v_note jsonb; v_key text;
begin
  v_keys:=case p_type
    when 'song' then array['title','artist','original_key','bpm','time_signature','lyrics_chords','youtube_url','spotify_url','image_url','album','tags']
    when 'setlist' then array['name','setlist_date','event_id','location','call_time','rehearsal_time','service_times','notes','leader_member_id','song_ids']
    when 'event' then array['name','type','event_date','starts_at','ends_at','location','description','rehearsal_date','rehearsal_time','rehearsal_end_time','assignments']
    when 'arrangement' then array['setlist_id','song_id','song_order','assigned_key','notes','band_notes','arrangement','lead_member_id','youtube_url']
    when 'dance' then array['title','song_id','event_id','choreography_notes','formation_notes','outfit_notes','song_title','song_artist','song_version','video_url']
    when 'annotation' then array['song_id','setlist_id','slot_id','notes','drawing'] end;
  if v_keys is null or p_value is null or jsonb_typeof(p_value)<>'object' or octet_length(p_value::text)>3145728 or p_value-v_keys<>'{}'::jsonb
    or not p_value ?& v_keys then raise exception 'Invalid mobile value' using errcode='22023'; end if;
  if p_type='annotation' then
    if jsonb_typeof(p_value->'notes')<>'array' or jsonb_array_length(p_value->'notes')>100 or (p_value->>'setlist_id' is null)<>(p_value->>'slot_id' is null)
      or (p_value->>'drawing' is not null and (length(p_value->>'drawing')>180000 or p_value->>'drawing' not like 'data:image/png;base64,%')) then raise exception 'Invalid annotations' using errcode='22023'; end if;
    for v_note in select value from jsonb_array_elements(p_value->'notes') loop
      if jsonb_typeof(v_note)<>'object' or v_note-array['id','text','x','y','font','fontSize','color','bold','italic','underline','strike']<>'{}'::jsonb
        or not v_note ?& array['id','text','x','y','font','fontSize','color','bold','italic','underline','strike']
        or jsonb_typeof(v_note->'id')<>'string' or length(v_note->>'id')>100 or jsonb_typeof(v_note->'text')<>'string' or length(v_note->>'text')>4000
        or jsonb_typeof(v_note->'x')<>'number' or (v_note->>'x')::numeric<0 or jsonb_typeof(v_note->'y')<>'number' or (v_note->>'y')::numeric<0
        or coalesce(v_note->>'font','') not in ('sans','serif','mono') or jsonb_typeof(v_note->'fontSize')<>'number' or (v_note->>'fontSize')::numeric not between 12 and 72
        or (v_note->>'fontSize')::numeric<>trunc((v_note->>'fontSize')::numeric) or coalesce(v_note->>'color','') !~ '^#[0-9a-fA-F]{6}$'
        or jsonb_typeof(v_note->'bold')<>'boolean' or jsonb_typeof(v_note->'italic')<>'boolean' or jsonb_typeof(v_note->'underline')<>'boolean' or jsonb_typeof(v_note->'strike')<>'boolean' then raise exception 'Invalid chart note' using errcode='22023'; end if;
    end loop;
  else
    v_core:=p_value-case p_type when 'setlist' then array['event_id'] when 'arrangement' then array['setlist_id','song_id','song_order'] when 'dance' then array['song_id','event_id'] else '{}'::text[] end;
    -- Empty charts are valid template slots, but shared proposals require text.
    if p_type='song' and v_core->>'lyrics_chords'='' then v_core:=jsonb_set(v_core,'{lyrics_chords}','"mobile validation placeholder"'); end if;
    if p_type='dance' and v_core->'choreography_notes'='null'::jsonb then v_core:=jsonb_set(v_core,'{choreography_notes}','"mobile validation placeholder"'); end if;
    perform private.validate_shared_edit_changes(case p_type when 'arrangement' then 'song_slot' when 'dance' then 'choreography' else p_type end,v_core);
  end if;
  foreach v_key in array array['song_id','setlist_id','slot_id','event_id'] loop
    if p_value ? v_key and p_value->>v_key is not null then perform (p_value->>v_key)::uuid; end if;
  end loop;
  if p_type='arrangement' and (jsonb_typeof(p_value->'song_order')<>'number' or (p_value->>'song_order')::numeric not between 1 and 200 or (p_value->>'song_order')::numeric<>trunc((p_value->>'song_order')::numeric)) then raise exception 'Invalid arrangement order' using errcode='22023'; end if;
end;
$$;
revoke all on function private.validate_mobile_value(text,jsonb) from public,anon,authenticated;

-- These capabilities predate has_team_permission's owner-override subset.
-- Keep the website role defaults and custom-role grants at this boundary.
create function private.mobile_has_permission(p_team uuid,p_permission text) returns boolean language sql stable security definer set search_path='' as $$
  select private.is_approved_member(p_team) and coalesce(private.permission_override_value(p_team,p_permission),
    case p_permission
      when 'songs.delete' then private.has_team_role(p_team,array['owner','admin','worship_leader']::public.team_role[])
      when 'events.request' then private.has_team_role(p_team,array['owner','admin','pastor','worship_leader','band_leader']::public.team_role[])
      when 'dance_notes.manage' then private.has_team_role(p_team,array['owner','admin','dancer']::public.team_role[])
      else private.has_team_permission(p_team,p_permission) end
    or exists(select 1 from public.team_members tm join public.custom_roles cr on cr.id=tm.custom_role_id and cr.team_id=tm.team_id
      where tm.team_id=p_team and tm.profile_id=auth.uid() and tm.status='active' and p_permission=any(cr.permissions)));
$$;
revoke all on function private.mobile_has_permission(uuid,text) from public,anon,authenticated;

create function private.mobile_require_write(p_team uuid,p_type text,p_id uuid,p_create boolean,p_delete boolean) returns void language plpgsql security definer set search_path='' as $$
declare v_creator uuid;
begin
  if auth.uid() is null or not private.is_approved_member(p_team) then raise exception 'Active team membership required' using errcode='42501'; end if;
  if p_type='song' then
    if p_create then
      if not private.has_team_permission(p_team,'songs.create') then raise exception 'Song creation unavailable' using errcode='42501'; end if;
    elsif p_delete then
      if not private.mobile_has_permission(p_team,'songs.delete') then raise exception 'Song deletion unavailable' using errcode='42501'; end if;
    else
      select created_by into v_creator from public.songs where id=p_id and team_id=p_team;
      if private.permission_override_value(p_team,'songs.edit') is false or (v_creator is distinct from auth.uid() and not private.has_team_permission(p_team,'songs.edit')) then raise exception 'Submit this song edit for review' using errcode='42501'; end if;
    end if;
  elsif p_type in ('setlist','arrangement') then
    if not private.has_team_permission(p_team,'setlists.manage') then raise exception 'Setlist editing unavailable' using errcode='42501'; end if;
  elsif p_type='event' then
    if not private.has_team_permission(p_team,'events.manage') and not (p_create and private.mobile_has_permission(p_team,'events.request')) then raise exception 'Event editing unavailable' using errcode='42501'; end if;
  elsif p_type='dance' then
    if p_create then
      if not private.mobile_has_permission(p_team,'dance_notes.manage') then raise exception 'Dance creation unavailable' using errcode='42501'; end if;
    elsif not private.can_review_shared_edit(p_team,'choreography') then raise exception 'Submit this dance edit for review' using errcode='42501'; end if;
  elsif p_type<>'annotation' then raise exception 'Unsupported entity' using errcode='22023'; end if;
end;
$$;
revoke all on function private.mobile_require_write(uuid,text,uuid,boolean,boolean) from public,anon,authenticated;

create function private.mobile_write(p_team uuid,p_type text,p_id uuid,p_value jsonb,p_create boolean) returns void language plpgsql security definer set search_path='' as $$
declare v_kind text; v_parent uuid; v_revision bigint; v_current jsonb;
begin
  -- All foreign references are resolved inside this team, independent of caller JSON.
  if p_value->>'song_id' is not null and not exists(select 1 from public.songs where id=(p_value->>'song_id')::uuid and team_id=p_team and deleted_at is null and status='approved') then raise exception 'Song unavailable' using errcode='42501'; end if;
  if p_value->>'event_id' is not null and not exists(select 1 from public.events where id=(p_value->>'event_id')::uuid and team_id=p_team and deleted_at is null and approval_status='approved') then raise exception 'Event unavailable' using errcode='42501'; end if;
  if p_value->>'setlist_id' is not null then
    v_parent:=(p_value->>'setlist_id')::uuid;
    perform 1 from public.setlists where id=v_parent and team_id=p_team and deleted_at is null for update;
    if not found then raise exception 'Setlist unavailable' using errcode='42501'; end if;
  end if;
  if p_value->>'slot_id' is not null and not exists(select 1 from public.setlist_songs where id=(p_value->>'slot_id')::uuid and setlist_id=v_parent and song_id=(p_value->>'song_id')::uuid and deleted_at is null) then raise exception 'Chart slot unavailable' using errcode='42501'; end if;
  if p_type='annotation' then
    if p_create then insert into public.mobile_annotations(id,team_id,actor_id,song_id,setlist_id,slot_id,notes,drawing)
      values(p_id,p_team,auth.uid(),(p_value->>'song_id')::uuid,(p_value->>'setlist_id')::uuid,(p_value->>'slot_id')::uuid,p_value->'notes',p_value->>'drawing');
    else
      select private.mobile_record(p_team,p_type,p_id)->'value' into v_current;
      if v_current-array['notes','drawing']<>p_value-array['notes','drawing'] then raise exception 'Annotation links cannot change' using errcode='22023'; end if;
      update public.mobile_annotations set notes=p_value->'notes',drawing=p_value->>'drawing',updated_at=now() where id=p_id and team_id=p_team and actor_id=auth.uid();
    end if;
  elsif p_type='arrangement' then
    if p_create then
      if (select count(*) from public.setlist_songs where setlist_id=v_parent and deleted_at is null)>=200 then raise exception 'At most 200 arrangements' using errcode='22023'; end if;
      if p_value->>'lead_member_id' is not null then perform private.validate_event_assignment_payload(p_team,jsonb_build_array(jsonb_build_object('team_member_id',p_value->'lead_member_id','assignment','Worship Leader'))); end if;
      insert into public.setlist_songs(id,setlist_id,song_id,song_order,assigned_key,notes,band_notes,arrangement,lead_member_id,youtube_url)
        values(p_id,v_parent,(p_value->>'song_id')::uuid,(select coalesce(max(song_order),0)+1 from public.setlist_songs where setlist_id=v_parent),p_value->>'assigned_key',p_value->>'notes',p_value->>'band_notes',p_value->>'arrangement',(p_value->>'lead_member_id')::uuid,p_value->>'youtube_url');
    else
      v_current:=private.mobile_record(p_team,p_type,p_id)->'value';
      if v_current->'setlist_id'<>p_value->'setlist_id' or v_current->'song_id'<>p_value->'song_id' then raise exception 'Arrangement links cannot change' using errcode='22023'; end if;
      perform public.mutate_setlist_slot(v_parent,p_id,'update',p_value-array['setlist_id','song_id','song_order']);
    end if;
    if (select song_order from public.setlist_songs where id=p_id)<>(p_value->>'song_order')::integer then perform public.mutate_setlist_slot(v_parent,p_id,'move',jsonb_build_object('song_order',p_value->'song_order')); end if;
  elsif p_type='song' and p_create then
    insert into public.songs(id,team_id,created_by,title,artist,original_key,bpm,time_signature,lyrics_chords,youtube_url,spotify_url,image_url,album,tags)
      select p_id,p_team,auth.uid(),r.title,r.artist,r.original_key,r.bpm,r.time_signature,r.lyrics_chords,r.youtube_url,r.spotify_url,r.image_url,r.album,r.tags from jsonb_populate_record(null::public.songs,p_value) r;
  elsif p_type='setlist' then
    if p_create then
      insert into public.setlists(id,team_id,created_by,name,setlist_date,event_id) values(p_id,p_team,auth.uid(),p_value->>'name',(p_value->>'setlist_date')::date,(p_value->>'event_id')::uuid);
    else
      if (select event_id from public.setlists where id=p_id) is distinct from (p_value->>'event_id')::uuid then raise exception 'Change event links through the online event workflow' using errcode='22023'; end if;
    end if;
    select sync_revision into v_revision from public.setlists where id=p_id and team_id=p_team;
    perform public.save_setlist_workspace(p_team,p_id,null,p_value || jsonb_build_object('update_event',false),array(select jsonb_array_elements_text(p_value->'song_ids')::uuid),null,v_revision);
  elsif p_type='event' then
    if p_create then
      perform private.validate_event_assignment_payload(p_team,p_value->'assignments');
      insert into public.events(id,team_id,created_by,name,type,event_date,starts_at,ends_at,location,description,rehearsal_date,rehearsal_time,rehearsal_end_time,approval_status,requested_assignments)
        select p_id,p_team,auth.uid(),r.name,r.type,r.event_date,r.starts_at,r.ends_at,r.location,r.description,r.rehearsal_date,r.rehearsal_time,r.rehearsal_end_time,
        case when private.has_team_permission(p_team,'events.manage') then 'approved' else 'pending' end,p_value->'assignments' from jsonb_populate_record(null::public.events,p_value) r;
      if private.has_team_permission(p_team,'events.manage') then
        insert into public.event_assignments(event_id,team_member_id,assignment) select p_id,(item->>'team_member_id')::uuid,item->>'assignment' from jsonb_array_elements(p_value->'assignments') item;
      end if;
    else
      select sync_revision into v_revision from public.events where id=p_id and team_id=p_team;
      perform public.save_event_workspace(p_team,p_id,p_value,p_value->'assignments',null,v_revision);
    end if;
  elsif p_type='dance' and p_create then
    insert into public.dance_notes(id,team_id,created_by,title,song_id,event_id,choreography_notes,formation_notes,outfit_notes,song_title,song_artist,song_version,video_url)
      select p_id,p_team,auth.uid(),r.title,r.song_id,r.event_id,r.choreography_notes,r.formation_notes,r.outfit_notes,r.song_title,r.song_artist,r.song_version,r.video_url from jsonb_populate_record(null::public.dance_notes,p_value) r;
  else
    v_kind:=case p_type when 'dance' then 'choreography' else p_type end;
    if p_type='dance' then
      v_current:=private.mobile_record(p_team,p_type,p_id)->'value';
      if v_current->'song_id'<>p_value->'song_id' or v_current->'event_id'<>p_value->'event_id' then raise exception 'Dance links cannot change' using errcode='22023'; end if;
    end if;
    perform private.apply_shared_edit(v_kind,p_id,case when p_type='dance' then p_value-array['song_id','event_id'] else p_value end);
  end if;
end;
$$;
revoke all on function private.mobile_write(uuid,text,uuid,jsonb,boolean) from public,anon,authenticated;

create function public.mobile_apply_command(p_team_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_nonce uuid; v_type text; v_operation text; v_base jsonb; v_local jsonb; v_remote jsonb;
  v_merged jsonb; v_fields jsonb:='[]'; v_key text; v_revision bigint; v_create boolean; v_receipt public.mobile_command_receipts%rowtype; v_result jsonb;
begin
  if p_command is null or jsonb_typeof(p_command)<>'object' or octet_length(p_command::text)>6291456
    or p_command-array['commandId','entityType','entityId','baseRevision','baseValue','value','operation']<>'{}'::jsonb
    or not p_command ?& array['commandId','entityType','entityId','baseRevision','baseValue','value'] then raise exception 'Invalid command' using errcode='22023'; end if;
  v_id:=(p_command->>'entityId')::uuid; v_nonce:=(p_command->>'commandId')::uuid; v_type:=p_command->>'entityType';
  v_revision:=(p_command->>'baseRevision')::bigint; v_base:=nullif(p_command->'baseValue','null'::jsonb); v_local:=p_command->'value'; v_operation:=coalesce(p_command->>'operation','upsert');
  if v_revision is null or v_revision not between 0 and 9007199254740991 or v_operation not in ('upsert','delete') then raise exception 'Invalid revision or operation' using errcode='22023'; end if;
  perform private.validate_mobile_value(v_type,v_local);
  if v_base is not null then perform private.validate_mobile_value(v_type,v_base); end if;
  v_create:=v_base is null;
  if v_create and (v_revision<>0 or v_operation='delete') then raise exception 'Invalid creation command' using errcode='22023'; end if;
  perform private.lock_workspace_members(p_team_id);
  perform private.mobile_require_write(p_team_id,v_type,v_id,v_create,v_operation='delete');
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_team_id::text || v_nonce::text,0));
  select * into v_receipt from public.mobile_command_receipts where actor_id=auth.uid() and team_id=p_team_id and command_id=v_nonce;
  if found then
    if v_receipt.command<>p_command then raise exception 'Command ID was already used' using errcode='22023'; end if;
    -- Revocation is checked before a receipt containing prior content is returned.
    if private.mobile_record(p_team_id,v_type,v_id) is null then raise exception 'Record unavailable' using errcode='42501'; end if;
    return v_receipt.result;
  end if;
  -- Team membership locks serialize mobile commands with guarded workspace RPCs.
  -- Row locks also serialize direct website writes and deletion.
  if v_type='song' then perform 1 from public.songs where id=v_id for update;
  elsif v_type='setlist' then perform 1 from public.setlists where id=v_id for update;
  elsif v_type='event' then perform 1 from public.setlists where event_id=v_id order by id for update; perform 1 from public.events where id=v_id for update;
  elsif v_type='arrangement' then perform 1 from public.setlists where id=coalesce((v_local->>'setlist_id')::uuid,(v_base->>'setlist_id')::uuid) for update; perform 1 from public.setlist_songs where id=v_id for update;
  elsif v_type='dance' then perform 1 from public.dance_notes where id=v_id for update;
  else perform 1 from public.mobile_annotations where id=v_id for update; end if;
  v_remote:=private.mobile_record(p_team_id,v_type,v_id);
  if v_create then
    if v_remote is not null then v_fields:='["$record"]';
    else
      -- A colliding UUID owned by another account is never an upsert target.
      if (v_type='song' and exists(select 1 from public.songs where id=v_id)) or (v_type='setlist' and exists(select 1 from public.setlists where id=v_id))
        or (v_type='event' and exists(select 1 from public.events where id=v_id)) or (v_type='arrangement' and exists(select 1 from public.setlist_songs where id=v_id))
        or (v_type='dance' and exists(select 1 from public.dance_notes where id=v_id)) or (v_type='annotation' and exists(select 1 from public.mobile_annotations where id=v_id)) then raise exception 'Record unavailable' using errcode='42501'; end if;
      v_merged:=v_local;
    end if;
  else
    if v_remote is null then raise exception 'Record unavailable; retain your draft' using errcode='42501'; end if;
    if not exists(select 1 from public.mobile_record_bases where actor_id=auth.uid() and team_id=p_team_id and entity_type=v_type and entity_id=v_id and revision=v_revision and record->'value'=v_base) then raise exception 'Download the base record before editing; retain your draft' using errcode='22023'; end if;
    if coalesce((v_remote->>'deleted')::boolean,false) then v_fields:='["$deleted"]';
    elsif v_revision>(v_remote->>'revision')::bigint then raise exception 'Invalid future revision' using errcode='22023';
    elsif v_operation='delete' then
      if v_revision<>(v_remote->>'revision')::bigint then v_fields:='["$deleted"]'; end if;
    else
      v_merged:=v_remote->'value';
      for v_key in select jsonb_object_keys(v_local) loop
        if v_local->v_key is distinct from v_base->v_key then
          if v_remote->'value'->v_key is distinct from v_base->v_key and v_remote->'value'->v_key is distinct from v_local->v_key then v_fields:=v_fields || to_jsonb(v_key);
          else v_merged:=jsonb_set(v_merged,array[v_key],v_local->v_key); end if;
        end if;
      end loop;
    end if;
  end if;
  if jsonb_array_length(v_fields)>0 then
    insert into public.mobile_record_bases(actor_id,team_id,entity_type,entity_id,revision,record)
      values(auth.uid(),p_team_id,v_type,v_id,(v_remote->>'revision')::bigint,v_remote) on conflict do nothing;
    v_result:=jsonb_build_object('commandId',v_nonce,'status','conflict','baseValue',v_base,'localValue',v_local,'remote',v_remote,'fields',v_fields);
  else
    if v_operation='delete' then
      case v_type
      when 'song' then update public.songs set deleted_at=now() where id=v_id and team_id=p_team_id;
      when 'setlist' then perform public.delete_setlist_cascade(v_id);
      when 'event' then perform public.delete_event_cascade(v_id);
      when 'arrangement' then perform public.mutate_setlist_slot((v_remote->'value'->>'setlist_id')::uuid,v_id,'remove','{}');
      when 'dance' then delete from public.dance_notes where id=v_id and team_id=p_team_id;
      when 'annotation' then delete from public.mobile_annotations where id=v_id and team_id=p_team_id and actor_id=auth.uid();
      end case;
    else perform private.mobile_write(p_team_id,v_type,v_id,v_merged,v_create); end if;
    v_remote:=private.mobile_record(p_team_id,v_type,v_id);
    if v_remote is null then raise exception 'Mutation did not produce a record' using errcode='22023'; end if;
    insert into public.mobile_record_bases(actor_id,team_id,entity_type,entity_id,revision,record)
      values(auth.uid(),p_team_id,v_type,v_id,(v_remote->>'revision')::bigint,v_remote) on conflict do nothing;
    v_result:=jsonb_build_object('commandId',v_nonce,'status','applied','record',v_remote);
  end if;
  insert into public.mobile_command_receipts(actor_id,team_id,command_id,command,result) values(auth.uid(),p_team_id,v_nonce,p_command,v_result);
  return v_result;
end;
$$;
revoke all on function public.mobile_apply_command(uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_command(uuid,jsonb) to authenticated;

create function public.mobile_download_page(p_team_id uuid,p_selection jsonb,p_cursor jsonb default null,p_manifest_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_manifest uuid:=p_manifest_id; v_kind text:=p_selection->>'kind'; v_id uuid:=(p_selection->>'id')::uuid;
  v_candidate record; v_record jsonb; v_records jsonb:='[]'; v_last jsonb; v_count integer:=0; v_page_bytes integer:=0;
begin
  if auth.uid() is null or not private.is_approved_member(p_team_id) then raise exception 'Active team membership required' using errcode='42501'; end if;
  if p_selection is null or jsonb_typeof(p_selection)<>'object' or v_kind not in ('library','song','setlist','event') or (v_kind<>'library' and v_id is null)
    or p_selection-array['kind','id']<>'{}'::jsonb then raise exception 'Invalid selection' using errcode='22023'; end if;
  if p_cursor is not null and (p_manifest_id is null or jsonb_typeof(p_cursor)<>'object' or not p_cursor ?& array['entityType','id'] or p_cursor-array['entityType','id']<>'{}'::jsonb) then raise exception 'A page cursor requires its manifest' using errcode='22023'; end if;
  if v_kind<>'library' and private.mobile_record(p_team_id,v_kind,v_id) is null then raise exception 'Selection unavailable' using errcode='42501'; end if;
  delete from public.mobile_download_manifests where actor_id=auth.uid() and expires_at<now();
  if v_manifest is null then
    insert into public.mobile_download_manifests(actor_id,team_id,selection) values(auth.uid(),p_team_id,p_selection) returning id into v_manifest;
    -- A single transaction freezes the complete graph before any page is served.
    for v_candidate in
      with selected_setlists as (
        select id from public.setlists where team_id=p_team_id and deleted_at is null and (v_kind='library' or (v_kind='setlist' and id=v_id) or (v_kind='event' and event_id=v_id))
      ), selected_songs as (
        select id from public.songs where team_id=p_team_id and deleted_at is null and status='approved' and (v_kind='library' or (v_kind='song' and id=v_id) or id in (select song_id from public.setlist_songs where setlist_id in (select id from selected_setlists) and deleted_at is null))
      ), candidates as (
        select 'song'::text entity_type,id from selected_songs
        union select 'setlist',id from selected_setlists
        union select 'arrangement',s.id from public.setlist_songs s where s.setlist_id in (select id from selected_setlists) and s.deleted_at is null
        union select 'event',e.id from public.events e where e.team_id=p_team_id and e.deleted_at is null and (e.approval_status='approved' or e.created_by=auth.uid() or private.has_team_role(p_team_id,array['owner','admin']::public.team_role[])) and (v_kind='library' or (v_kind='event' and e.id=v_id) or e.id in (select event_id from public.setlists where id in(select id from selected_setlists)))
        union select 'dance',d.id from public.dance_notes d where d.team_id=p_team_id and (v_kind='library' or d.song_id in(select id from selected_songs) or (v_kind='event' and d.event_id=v_id))
        union select 'annotation',a.id from public.mobile_annotations a where a.team_id=p_team_id and a.actor_id=auth.uid() and (v_kind='library' or a.song_id in(select id from selected_songs))
        union select entity_type,entity_id from public.mobile_deleted_records where team_id=p_team_id and (actor_id is null or actor_id=auth.uid()) and (v_kind='library' or (entity_type=v_kind and entity_id=v_id))
      ) select entity_type,id from candidates order by entity_type,id
    loop
      v_count:=v_count+1;
      if v_count>20000 then raise exception 'Library exceeds mobile manifest limit; download specific plans' using errcode='54000'; end if;
      v_record:=private.mobile_record(p_team_id,v_candidate.entity_type,v_candidate.id);
      if v_record is not null then
        insert into public.mobile_download_records(manifest_id,entity_type,entity_id,record) values(v_manifest,v_candidate.entity_type,v_candidate.id,v_record);
        insert into public.mobile_record_bases(actor_id,team_id,entity_type,entity_id,revision,record) values(auth.uid(),p_team_id,v_candidate.entity_type,v_candidate.id,(v_record->>'revision')::bigint,v_record) on conflict do nothing;
      end if;
    end loop;
  elsif not exists(select 1 from public.mobile_download_manifests where id=v_manifest and actor_id=auth.uid() and team_id=p_team_id and selection=p_selection and expires_at>now()) then raise exception 'Download expired; start a new manifest' using errcode='22023'; end if;
  for v_candidate in select record from public.mobile_download_records where manifest_id=v_manifest
    and (p_cursor is null or (entity_type,entity_id)>(p_cursor->>'entityType',(p_cursor->>'id')::uuid)) order by entity_type,entity_id limit 250 loop
    if v_page_bytes+octet_length(v_candidate.record::text)>3145728 and jsonb_array_length(v_records)>0 then exit; end if;
    v_records:=v_records || jsonb_build_array(v_candidate.record);
    v_page_bytes:=v_page_bytes+octet_length(v_candidate.record::text);
  end loop;
  -- Recheck each frozen record after permission or event visibility changes.
  -- Reject the page atomically, so callers never mark a partial download complete.
  for v_record in select value from jsonb_array_elements(v_records) loop
    if not private.mobile_can_read_record(p_team_id,v_record->>'entityType',(v_record->>'id')::uuid) then raise exception 'Download access changed; start a new manifest' using errcode='42501'; end if;
  end loop;
  v_last:=v_records->(jsonb_array_length(v_records)-1);
  return jsonb_build_object('manifestId',v_manifest,'records',v_records,'nextCursor',case when exists(select 1 from public.mobile_download_records where manifest_id=v_manifest and (entity_type,entity_id)>(v_last->>'entityType',(v_last->>'id')::uuid)) then jsonb_build_object('entityType',v_last->'entityType','id',v_last->'id') else null end);
end;
$$;
revoke all on function public.mobile_download_page(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.mobile_download_page(uuid,jsonb,jsonb,uuid) to authenticated;
commit;
