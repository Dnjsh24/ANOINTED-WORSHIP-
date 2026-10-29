-- Additive, unreleased asset snapshots. Apply after the record manifest migration.
-- Recovery: roll forward; existing record clients remain compatible. Expired snapshots
-- are deleted by the existing manifest cleanup cascade, never by deleting source files.
begin;

alter table public.mobile_download_manifests add column assets_frozen boolean not null default false;

create table public.mobile_download_assets (
  manifest_id uuid not null references public.mobile_download_manifests(id) on delete cascade,
  asset_id text not null check (asset_id ~ '^[A-Za-z0-9_-]{1,160}$'),
  descriptor jsonb not null,
  parents jsonb not null check (jsonb_typeof(parents)='array' and jsonb_array_length(parents)>0),
  file_id uuid,
  source_row jsonb not null,
  object_version jsonb,
  primary key(manifest_id,asset_id)
);
create index mobile_download_assets_storage_idx on public.mobile_download_assets
  ((descriptor#>>'{source,bucket}'),(descriptor#>>'{source,objectPath}'))
  where descriptor#>>'{source,kind}'='storage';
alter table public.mobile_download_assets enable row level security;
-- No direct client table access. All reads revalidate the current source and graph.
revoke all on public.mobile_download_assets from public,anon,authenticated;

create function private.mobile_asset_path(p_team uuid,p_path text) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(length(p_path)<=2048 and split_part(p_path,'/',1)=p_team::text
    and p_path !~ '[\\%[:cntrl:]]' and p_path !~ '(^|/)(\.?\.?)(/|$)',false)
$$;
revoke all on function private.mobile_asset_path(uuid,text) from public,anon,authenticated;

create function private.mobile_asset_object_version(p_bucket text,p_path text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',o.id,'updated_at',to_jsonb(o)->'updated_at','metadata',o.metadata)
  from storage.objects o where o.bucket_id=p_bucket and o.name=p_path
$$;
revoke all on function private.mobile_asset_object_version(text,text) from public,anon,authenticated;

create function private.mobile_freeze_assets(p_manifest uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m public.mobile_download_manifests; f record; s record; parents jsonb; primary_parent jsonb;
  descriptor jsonb; source jsonb; object_version jsonb; bucket text; path text; mime text; kind text;
  host text; prefix text; source_row jsonb; asset_id text; total integer:=0;
begin
  select * into m from public.mobile_download_manifests where id=p_manifest and actor_id=auth.uid() and expires_at>now();
  if not found or not private.is_approved_member(m.team_id) then raise exception 'Manifest unavailable' using errcode='42501'; end if;
  for f in select pf.* from public.practice_files pf where pf.team_id=m.team_id and exists(
    select 1 from public.mobile_download_records r where r.manifest_id=m.id and r.record->>'deleted' is distinct from 'true'
      and ((r.entity_type='song' and r.entity_id=pf.song_id) or (r.entity_type='event' and r.entity_id=pf.event_id)))
  loop
    parents:='[]';
    if f.song_id is not null then parents:=parents || jsonb_build_array(jsonb_build_object('entityType','song','entityId',f.song_id)); end if;
    if f.event_id is not null then parents:=parents || jsonb_build_array(jsonb_build_object('entityType','event','entityId',f.event_id)); end if;
    -- A dual-linked file never bypasses a hidden event through its visible song.
    if exists(select 1 from jsonb_array_elements(parents) p where not private.mobile_can_read_record(m.team_id,p->>'entityType',(p->>'entityId')::uuid)
      or exists(select 1 from public.mobile_deleted_records d where d.team_id=m.team_id and d.entity_type=p->>'entityType' and d.entity_id=(p->>'entityId')::uuid)) then continue; end if;
    select p into primary_parent from jsonb_array_elements(parents) p where exists(
      select 1 from public.mobile_download_records r where r.manifest_id=m.id
        and r.entity_type=p->>'entityType' and r.entity_id=(p->>'entityId')::uuid)
      order by p->>'entityType',p->>'entityId' limit 1;
    bucket:='practice-files'; path:=f.storage_path; mime:=f.mime_type;
    kind:=case when mime like 'image/%' then 'image' when mime='application/pdf' then 'document' when mime like 'audio/%' then 'audio' when mime like 'video/%' then 'video' else 'document' end;
    object_version:=private.mobile_asset_object_version(bucket,path);
    source:=case when not private.mobile_asset_path(m.team_id,path) or object_version is null then jsonb_build_object('kind','unavailable','reason','missing-object')
      when mime not like 'image/%' and mime<>'application/pdf' and mime not like 'audio/%' and mime not like 'video/%' then jsonb_build_object('kind','unavailable','reason','unsupported-type')
      else jsonb_build_object('kind','storage','bucket',bucket,'objectPath',path) end;
    source_row:=to_jsonb(f); asset_id:='file_' || replace(f.id::text,'-','');
    descriptor:=jsonb_build_object('assetId',asset_id,'purpose','attachment','entityType',primary_parent->'entityType','entityId',primary_parent->'entityId',
      'fileName',f.file_name,'mimeType',mime,'sizeBytes',f.size_bytes,'kind',kind,'source',source);
    descriptor:=descriptor || jsonb_build_object('version',encode(sha256(convert_to(jsonb_build_array(descriptor,source_row,object_version)::text,'UTF8')),'hex'));
    insert into public.mobile_download_assets values(m.id,asset_id,descriptor,parents,f.id,source_row,object_version);
    total:=total+1;
    if total>20000 then raise exception 'Asset manifest exceeds limit' using errcode='54000'; end if;
  end loop;
  for s in select r.entity_id,r.record->'value'->>'image_url' image_url from public.mobile_download_records r
    where r.manifest_id=m.id and r.entity_type='song' and r.record->>'deleted' is distinct from 'true' and nullif(r.record->'value'->>'image_url','') is not null
  loop
    path:=null; bucket:=null; object_version:=null;
    -- This is only an untrusted candidate. The server verifies the configured origin before exposing storage or signing.
    host:=substring(s.image_url from '^https://([^/]+)/');
    if host is not null then
      prefix:='https://' || host || '/storage/v1/object/public/';
      if starts_with(s.image_url,prefix) then
        bucket:=split_part(substr(s.image_url,length(prefix)+1),'/',1);
        path:=substr(s.image_url,length(prefix)+length(bucket)+2);
      end if;
    end if;
    source:=jsonb_build_object('kind','unavailable','reason','external-source','url',left(s.image_url,2048));
    if bucket in ('practice-files','presentation-media') and private.mobile_asset_path(m.team_id,path) then
      object_version:=private.mobile_asset_object_version(bucket,path);
      source:=case when object_version is null then jsonb_build_object('kind','unavailable','reason','missing-object','url',left(s.image_url,2048))
        else jsonb_build_object('kind','storage','bucket',bucket,'objectPath',path) end;
    end if;
    mime:=coalesce(object_version->'metadata'->>'mimetype','image/unknown');
    if object_version is not null and mime not like 'image/%' then source:=jsonb_build_object('kind','unavailable','reason','unsupported-type'); end if;
    parents:=jsonb_build_array(jsonb_build_object('entityType','song','entityId',s.entity_id));
    source_row:=jsonb_build_object('image_url',s.image_url); asset_id:='image_' || replace(s.entity_id::text,'-','');
    descriptor:=jsonb_build_object('assetId',asset_id,'purpose','cover','entityType','song','entityId',s.entity_id,'fileName',case when path is null then 'song-image' else split_part(path,'/',-1) end,
      'mimeType',mime,'sizeBytes',case when object_version->'metadata'->>'size' ~ '^[0-9]{1,15}$' then (object_version->'metadata'->>'size')::bigint else null end,'kind','image','source',source);
    descriptor:=descriptor || jsonb_build_object('version',encode(sha256(convert_to(jsonb_build_array(descriptor,source_row,object_version)::text,'UTF8')),'hex'));
    insert into public.mobile_download_assets values(m.id,asset_id,descriptor,parents,null,source_row,object_version);
    total:=total+1;
    if total>20000 then raise exception 'Asset manifest exceeds limit' using errcode='54000'; end if;
  end loop;
  update public.mobile_download_manifests set assets_frozen=true where id=m.id;
end;
$$;
revoke all on function private.mobile_freeze_assets(uuid) from public,anon,authenticated;

create function private.mobile_asset_authorized(p_team uuid,a public.mobile_download_assets) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare p jsonb; current_row jsonb;
begin
  if auth.uid() is null or not private.is_approved_member(p_team) then return false; end if;
  for p in select value from jsonb_array_elements(a.parents) loop
    if not private.mobile_can_read_record(p_team,p->>'entityType',(p->>'entityId')::uuid)
      or exists(select 1 from public.mobile_deleted_records d where d.team_id=p_team and d.entity_type=p->>'entityType' and d.entity_id=(p->>'entityId')::uuid) then return false; end if;
  end loop;
  if a.file_id is not null then
    select to_jsonb(f) into current_row from public.practice_files f where f.id=a.file_id and f.team_id=p_team;
    if current_row is null or current_row->'song_id' is distinct from a.source_row->'song_id'
      or current_row->'event_id' is distinct from a.source_row->'event_id'
      or current_row->'storage_path' is distinct from a.source_row->'storage_path' then return false; end if;
  else
    select jsonb_build_object('image_url',s.image_url) into current_row from public.songs s where s.id=(a.descriptor->>'entityId')::uuid and s.team_id=p_team and s.status='approved' and s.deleted_at is null;
    if current_row is null then return false; end if;
  end if;
  return a.descriptor->'source'->>'kind'<>'storage' or private.mobile_asset_path(p_team,a.descriptor->'source'->>'objectPath');
end;
$$;
revoke all on function private.mobile_asset_authorized(uuid,public.mobile_download_assets) from public,anon,authenticated;

create function private.mobile_asset_version_current(a public.mobile_download_assets) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare current_row jsonb;
begin
  if a.file_id is not null then
    select to_jsonb(f) into current_row from public.practice_files f where f.id=a.file_id;
  else
    select jsonb_build_object('image_url',s.image_url) into current_row from public.songs s where s.id=(a.descriptor->>'entityId')::uuid;
  end if;
  if current_row is distinct from a.source_row then return false; end if;
  if a.descriptor->'source'->>'kind'='storage' then
    return a.object_version is not distinct from private.mobile_asset_object_version(a.descriptor->'source'->>'bucket',a.descriptor->'source'->>'objectPath');
  end if;
  return true;
end;
$$;
revoke all on function private.mobile_asset_version_current(public.mobile_download_assets) from public,anon,authenticated;

create function public.mobile_download_asset_page(p_team_id uuid,p_manifest_id uuid,p_after text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.mobile_download_manifests; a public.mobile_download_assets; assets jsonb:='[]'; last_id text; incomplete boolean;
begin
  select * into m from public.mobile_download_manifests where id=p_manifest_id and actor_id=auth.uid() and team_id=p_team_id and assets_frozen and expires_at>now();
  if not found or not private.is_approved_member(p_team_id) then raise exception 'Manifest unavailable' using errcode='42501'; end if;
  if m.selection->>'kind'<>'library' and (not private.mobile_can_read_record(p_team_id,m.selection->>'kind',(m.selection->>'id')::uuid) or private.mobile_record(p_team_id,m.selection->>'kind',(m.selection->>'id')::uuid)->>'deleted'='true') then raise exception 'Selection unavailable' using errcode='42501'; end if;
  if p_after is not null and (p_after !~ '^[A-Za-z0-9_-]{1,160}$' or not exists(select 1 from public.mobile_download_assets where manifest_id=m.id and asset_id=p_after)) then raise exception 'Invalid asset cursor' using errcode='22023'; end if;
  for a in select * from public.mobile_download_assets where manifest_id=m.id and (p_after is null or asset_id>p_after) order by asset_id limit 100 loop
    if not private.mobile_asset_authorized(p_team_id,a) then raise exception 'Asset access changed' using errcode='42501'; end if;
    if not private.mobile_asset_version_current(a) then raise exception 'Asset version changed; restart download' using errcode='40001'; end if;
    assets:=assets || jsonb_build_array(a.descriptor || case when a.file_id is null then jsonb_build_object('imageUrl',a.source_row->>'image_url') else '{}'::jsonb end); last_id:=a.asset_id;
  end loop;
  select exists(select 1 from public.mobile_download_assets where manifest_id=m.id and descriptor->'source'->>'kind'='unavailable') into incomplete;
  return jsonb_build_object('manifestId',m.id,'assets',assets,'incomplete',incomplete,'nextId',case when exists(select 1 from public.mobile_download_assets where manifest_id=m.id and asset_id>last_id) then last_id else null end);
end;
$$;
revoke all on function public.mobile_download_asset_page(uuid,uuid,text) from public,anon;
grant execute on function public.mobile_download_asset_page(uuid,uuid,text) to authenticated;

create function public.mobile_download_asset_source(p_team_id uuid,p_manifest_id uuid,p_asset_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.mobile_download_manifests; a public.mobile_download_assets;
begin
  if p_asset_id is null or p_asset_id !~ '^[A-Za-z0-9_-]{1,160}$' then raise exception 'Invalid asset ID' using errcode='22023'; end if;
  select * into m from public.mobile_download_manifests where id=p_manifest_id and actor_id=auth.uid() and team_id=p_team_id and assets_frozen and expires_at>now();
  if not found or not private.is_approved_member(p_team_id) then raise exception 'Manifest unavailable' using errcode='42501'; end if;
  if m.selection->>'kind'<>'library' and (not private.mobile_can_read_record(p_team_id,m.selection->>'kind',(m.selection->>'id')::uuid) or private.mobile_record(p_team_id,m.selection->>'kind',(m.selection->>'id')::uuid)->>'deleted'='true') then raise exception 'Selection unavailable' using errcode='42501'; end if;
  select * into a from public.mobile_download_assets where manifest_id=m.id and asset_id=p_asset_id;
  if not found or not private.mobile_asset_authorized(p_team_id,a) or a.descriptor->'source'->>'kind'<>'storage' then raise exception 'Asset unavailable' using errcode='42501'; end if;
  if not private.mobile_asset_version_current(a) then raise exception 'Asset version changed; restart download' using errcode='40001'; end if;
  return a.descriptor || case when a.file_id is null then jsonb_build_object('imageUrl',a.source_row->>'image_url') else '{}'::jsonb end;
end;
$$;
revoke all on function public.mobile_download_asset_source(uuid,uuid,text) from public,anon;
grant execute on function public.mobile_download_asset_source(uuid,uuid,text) to authenticated;
-- Public presentation images require scoped SELECT for the user's Storage signer.
-- Existing website Storage policies retain their own behavior.
create function private.mobile_asset_object_allowed(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.mobile_download_manifests m join public.mobile_download_assets a on a.manifest_id=m.id
    where m.actor_id=auth.uid() and m.assets_frozen and m.expires_at>now() and private.is_approved_member(m.team_id)
      and (m.selection->>'kind'='library' or (private.mobile_can_read_record(m.team_id,m.selection->>'kind',(m.selection->>'id')::uuid) and private.mobile_record(m.team_id,m.selection->>'kind',(m.selection->>'id')::uuid)->>'deleted' is distinct from 'true'))
      and a.descriptor#>>'{source,kind}'='storage' and a.descriptor#>>'{source,bucket}'=p_bucket
      and a.descriptor#>>'{source,objectPath}'=p_path and private.mobile_asset_authorized(m.team_id,a) and private.mobile_asset_version_current(a))
$$;
revoke all on function private.mobile_asset_object_allowed(text,text) from public,anon;
grant execute on function private.mobile_asset_object_allowed(text,text) to authenticated;
create policy mobile_manifest_presentation_images on storage.objects for select to authenticated
  using(bucket_id='presentation-media' and private.mobile_asset_object_allowed(bucket_id,name));
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
        union select 'dance',d.id from public.dance_notes d where d.team_id=p_team_id and (d.song_id in(select id from selected_songs) or (v_kind='event' and d.event_id=v_id))
        union select 'annotation',a.id from public.mobile_annotations a where a.team_id=p_team_id and a.actor_id=auth.uid() and (a.song_id in(select id from selected_songs))
        union select entity_type,entity_id from public.mobile_deleted_records where team_id=p_team_id and (actor_id is null or actor_id=auth.uid()) and ((v_kind='library' and entity_type='song') or (entity_type=v_kind and entity_id=v_id))
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
