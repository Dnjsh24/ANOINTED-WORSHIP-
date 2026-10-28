-- Include custom-song and standalone charts in the existing frozen library graph.
-- Keep actor/team authorization, pagination, frozen bases and permission rechecks.
begin;
create or replace function public.mobile_download_page(p_team_id uuid,p_selection jsonb,p_cursor jsonb default null,p_manifest_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
        select id from public.setlists where team_id=p_team_id and deleted_at is null and ((v_kind='setlist' and id=v_id) or (v_kind='event' and event_id=v_id))
      ), selected_songs as (
        select id from public.songs where team_id=p_team_id and deleted_at is null and status='approved' and (v_kind='library' or (v_kind='song' and id=v_id) or id in (select song_id from public.setlist_songs where setlist_id in (select id from selected_setlists) and deleted_at is null))
      ), candidates as (
        select 'song'::text entity_type,id from selected_songs
        union select 'setlist',id from selected_setlists
        union select 'arrangement',s.id from public.setlist_songs s where s.setlist_id in (select id from selected_setlists) and s.deleted_at is null
        union select 'event',e.id from public.events e where e.team_id=p_team_id and e.deleted_at is null and (e.approval_status='approved' or e.created_by=auth.uid() or private.has_team_role(p_team_id,array['owner','admin']::public.team_role[])) and ((v_kind='event' and e.id=v_id) or e.id in (select event_id from public.setlists where id in(select id from selected_setlists)))
        union select 'dance',d.id from public.dance_notes d where d.team_id=p_team_id and (v_kind='library' or d.song_id in(select id from selected_songs) or (v_kind='event' and d.event_id=v_id))
        union select 'annotation',a.id from public.mobile_annotations a where a.team_id=p_team_id and a.actor_id=auth.uid() and (a.song_id in(select id from selected_songs))
        union select entity_type,entity_id from public.mobile_deleted_records where team_id=p_team_id and (actor_id is null or actor_id=auth.uid()) and ((v_kind='library' and entity_type in ('song','dance')) or (entity_type=v_kind and entity_id=v_id))
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
    perform private.mobile_freeze_assets(v_manifest);
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
