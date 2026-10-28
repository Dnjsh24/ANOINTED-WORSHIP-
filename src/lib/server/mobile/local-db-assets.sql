\set ON_ERROR_STOP on
-- Local PostgreSQL18 only. Supabase Auth/Storage services remain separately unverified.
alter table storage.objects add column if not exists updated_at timestamptz not null default now();
grant select on storage.objects to authenticated;
create temporary table asset_state(key text primary key,value jsonb);
grant all on asset_state to authenticated;
insert into auth.users(id,email) values
('71000000-0000-4000-8000-000000000001','asset-a@example.test'),
('71000000-0000-4000-8000-000000000002','asset-b@example.test'),
('71000000-0000-4000-8000-000000000003','asset-member@example.test');
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',false);
insert into asset_state select 'teamA',to_jsonb(team_id) from public.create_team_workspace('Asset A','AA-87521');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',false);
insert into asset_state select 'teamB',to_jsonb(team_id) from public.create_team_workspace('Asset B','AB-87522');
reset role;
select set_config('request.jwt.claim.sub','',false);
-- Seed actual sources and graph under the fixture owner; all RPCs execute as users.
do $$declare t uuid; b uuid;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';
 select (value#>>'{}')::uuid into b from asset_state where key='teamB';
 insert into public.songs(id,team_id,title,artist,original_key,time_signature,lyrics_chords,status,created_by,image_url) values
 ('72000000-0000-4000-8000-000000000001',t,'Image song','Artist','C','4/4','Lyrics','approved','71000000-0000-4000-8000-000000000001','https://project.supabase.co/storage/v1/object/public/presentation-media/'||t||'/image.png'),
 ('72000000-0000-4000-8000-000000000002',t,'External song','Artist','C','4/4','Lyrics','approved','71000000-0000-4000-8000-000000000001','https://images.example.test/cover.jpg'),
 ('72000000-0000-4000-8000-000000000003',t,'Pending song','Artist','C','4/4','Lyrics','pending','71000000-0000-4000-8000-000000000001',null),
 ('72000000-0000-4000-8000-000000000004',b,'Other tenant','Artist','C','4/4','Lyrics','approved','71000000-0000-4000-8000-000000000002',null);
 insert into public.events(id,team_id,name,type,event_date,starts_at,created_by) values
 ('73000000-0000-4000-8000-000000000001',t,'Unrelated event','service','2026-10-20','10:00','71000000-0000-4000-8000-000000000001');
 insert into public.setlists(id,team_id,name,setlist_date,created_by) values
 ('74000000-0000-4000-8000-000000000001',t,'Unrelated setlist','2026-10-20','71000000-0000-4000-8000-000000000001');
 insert into public.dance_notes(id,team_id,title,song_id,created_by) values
 ('75000000-0000-4000-8000-000000000001',t,'Linked dance','72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001'),
 ('75000000-0000-4000-8000-000000000002',t,'Unrelated dance',null,'71000000-0000-4000-8000-000000000001');
 insert into public.practice_files(id,team_id,song_id,event_id,storage_path,file_name,mime_type,size_bytes,uploaded_by) values
 ('76000000-0000-4000-8000-000000000001',t,'72000000-0000-4000-8000-000000000001',null,t||'/chart.pdf','Chart.pdf','application/pdf',40,'71000000-0000-4000-8000-000000000001'),
 ('76000000-0000-4000-8000-000000000002',t,'72000000-0000-4000-8000-000000000001',null,t||'/song.mp3','Song.mp3','audio/mpeg',40,'71000000-0000-4000-8000-000000000001'),
 ('76000000-0000-4000-8000-000000000003',t,'72000000-0000-4000-8000-000000000001',null,t||'/missing.pdf','Missing.pdf','application/pdf',40,'71000000-0000-4000-8000-000000000001'),
 ('76000000-0000-4000-8000-000000000004',t,'72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',t||'/dual.pdf','Dual.pdf','application/pdf',40,'71000000-0000-4000-8000-000000000001'),
 ('76000000-0000-4000-8000-000000000005',t,'72000000-0000-4000-8000-000000000001',null,b||'/foreign.pdf','Foreign.pdf','application/pdf',40,'71000000-0000-4000-8000-000000000001');
 insert into storage.objects(bucket_id,name,metadata) values
 ('practice-files',t||'/chart.pdf','{"mimetype":"application/pdf","size":40,"eTag":"one"}'),
 ('practice-files',t||'/song.mp3','{"mimetype":"audio/mpeg","size":40,"eTag":"one"}'),
 ('practice-files',t||'/dual.pdf','{"mimetype":"application/pdf","size":40,"eTag":"one"}'),
 ('practice-files',b||'/foreign.pdf','{"mimetype":"application/pdf","size":40,"eTag":"one"}'),
 ('presentation-media',t||'/image.png','{"mimetype":"image/png","size":40,"eTag":"one"}');
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',false);
do $$declare t uuid; page jsonb; assets jsonb; manifest uuid; denied boolean;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';
 page:=public.mobile_download_page(t,'{"kind":"library"}'); manifest:=(page->>'manifestId')::uuid;
 assert jsonb_array_length(page->'records')=4,'Library must contain approved songs and both linked and standalone Dance charts';
 assert not exists(select 1 from jsonb_array_elements(page->'records') r where r->>'entityType' in ('setlist','event','arrangement')),'Library leaked unrelated graph';
 assets:=public.mobile_download_asset_page(t,manifest);
 assert jsonb_array_length(assets->'assets')=7,'Frozen linked assets are missing';
 assert assets->>'incomplete'='true','Missing and external images must mark incomplete';
 assert exists(select 1 from jsonb_array_elements(assets->'assets') a where a->>'kind'='audio'),'Audio opt-in metadata missing';
 assert exists(select 1 from jsonb_array_elements(assets->'assets') a where a->'source'->>'reason'='external-source'),'External image omitted';
 assert (public.mobile_download_asset_source(t,manifest,'file_76000000000040008000000000000001')->>'version') ~ '^[a-f0-9]{64}$','Invalid version';
 assert exists(select 1 from storage.objects where bucket_id='presentation-media' and name=t||'/image.png'),'Authenticated presentation signer RLS denied linked image';
 denied:=false;begin perform public.mobile_download_asset_source(t,manifest,'file_76000000000040008000000000000005');exception when insufficient_privilege then denied:=true;end;
 assert denied,'Foreign path was signable';
 denied:=false;begin perform count(*) from public.mobile_download_assets;exception when insufficient_privilege then denied:=true;end;
 assert denied,'Direct snapshot read was granted';
 insert into asset_state values('manifest',to_jsonb(manifest)),('firstAssets',assets);
 raise notice 'PASS atomic graph, explicit missing/external, opted media metadata, safe path, Storage RLS and direct access';
end$$;
-- Cross-actor, cross-team and anonymous calls must fail.
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',false);
do $$declare t uuid; b uuid; m uuid; denied boolean;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA'; select (value#>>'{}')::uuid into b from asset_state where key='teamB'; select (value#>>'{}')::uuid into m from asset_state where key='manifest';
 denied:=false;begin perform public.mobile_download_asset_page(t,m);exception when insufficient_privilege then denied:=true;end;assert denied,'Other actor read manifest';
 denied:=false;begin perform public.mobile_download_asset_source(b,m,'file_76000000000040008000000000000001');exception when insufficient_privilege then denied:=true;end;assert denied,'Other team signed manifest';
 assert not exists(select 1 from storage.objects where bucket_id='presentation-media'),'Other tenant read image through manifest policy';
 raise notice 'PASS actor and tenant denial';
end$$;
reset role;
set role anon;
do $$declare denied boolean:=false;begin begin perform public.mobile_download_asset_page(gen_random_uuid(),gen_random_uuid());exception when insufficient_privilege then denied:=true;end;assert denied,'Anonymous RPC allowed';end$$;
reset role;
-- Current object replacement invalidates the original snapshot, not silently updated bytes.
update storage.objects set updated_at=updated_at+interval '1 second',metadata=jsonb_set(metadata,'{eTag}','"two"') where name like '%/chart.pdf';
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',false);
do $$declare t uuid; m uuid; denied boolean; page jsonb;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';select (value#>>'{}')::uuid into m from asset_state where key='manifest';
 denied:=false;begin perform public.mobile_download_asset_source(t,m,'file_76000000000040008000000000000001');exception when serialization_failure then denied:=true;end;assert denied,'Replaced object must return retry, not account revocation';
 denied:=false;begin perform public.mobile_download_asset_page(t,m);exception when serialization_failure then denied:=true;end;assert denied,'Changed asset page must return retry, not account revocation';
 page:=public.mobile_download_page(t,'{"kind":"library"}');insert into asset_state values('freshManifest',page->'manifestId');
 assert public.mobile_download_asset_source(t,(page->>'manifestId')::uuid,'file_76000000000040008000000000000001')->>'version'
   <> (select a->>'version' from asset_state s,jsonb_array_elements(s.value->'assets') a where s.key='firstAssets' and a->>'assetId'='file_76000000000040008000000000000001'),'Replacement did not change digest';
 raise notice 'PASS frozen version and replacement invalidation';
end$$;
reset role;
-- Unlinking a dual parent invalidates the snapshot even while the song stays visible.
update public.practice_files set event_id=null where id='76000000-0000-4000-8000-000000000004';
set role authenticated;
do $$declare t uuid; m uuid; denied boolean:=false;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';select (value#>>'{}')::uuid into m from asset_state where key='freshManifest';
 begin perform public.mobile_download_asset_source(t,m,'file_76000000000040008000000000000004');exception when insufficient_privilege then denied:=true;end;assert denied,'Changed link was accepted';
 raise notice 'PASS link revocation';
end$$;
reset role;
insert into public.team_members(team_id,profile_id,role,status)
  select (value#>>'{}')::uuid,'71000000-0000-4000-8000-000000000003','member','active' from asset_state where key='teamA';
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',false);
insert into asset_state select 'memberManifest',public.mobile_download_page((value#>>'{}')::uuid,'{"kind":"song","id":"72000000-0000-4000-8000-000000000001"}')->'manifestId' from asset_state where key='teamA';
reset role;
select set_config('request.jwt.claim.sub','',false);
update public.team_members set status='inactive' where profile_id='71000000-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',false);
do $$declare t uuid; m uuid; denied boolean:=false;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';select (value#>>'{}')::uuid into m from asset_state where key='memberManifest';
 begin perform public.mobile_download_asset_page(t,m);exception when insufficient_privilege then denied:=true;end;assert denied,'Revoked member read assets';
 raise notice 'PASS membership revocation';
end$$;
reset role;


-- Restore ordinary membership, then prove ALL dual-linked parents remain required.
select set_config('request.jwt.claim.sub','',false);
update public.team_members set status='active' where profile_id='71000000-0000-4000-8000-000000000003';
update public.practice_files set event_id='73000000-0000-4000-8000-000000000001' where id='76000000-0000-4000-8000-000000000004';
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',false);
insert into asset_state select 'dualManifest',public.mobile_download_page((value#>>'{}')::uuid,'{"kind":"song","id":"72000000-0000-4000-8000-000000000001"}')->'manifestId' from asset_state where key='teamA';
do $$declare t uuid; m uuid;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';select (value#>>'{}')::uuid into m from asset_state where key='dualManifest';
 assert public.mobile_download_asset_source(t,m,'file_76000000000040008000000000000004') is not null,'Visible dual file denied';
end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
update public.events set approval_status='pending' where id='73000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',false);
do $$declare t uuid; m uuid; denied boolean:=false; page jsonb;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';select (value#>>'{}')::uuid into m from asset_state where key='dualManifest';
 begin perform public.mobile_download_asset_source(t,m,'file_76000000000040008000000000000004');exception when insufficient_privilege then denied:=true;end;assert denied,'Hidden event was bypassed via visible song';
 page:=public.mobile_download_page(t,'{"kind":"song","id":"72000000-0000-4000-8000-000000000001"}');
 assert not exists(select 1 from jsonb_array_elements(public.mobile_download_asset_page(t,(page->>'manifestId')::uuid)->'assets') a where a->>'assetId'='file_76000000000040008000000000000004'),'Freeze disclosed a hidden dual parent';
 raise notice 'PASS all linked parent visibility at freeze and read';
end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
update public.mobile_download_manifests set expires_at=now()-interval '1 second' where id=(select (value#>>'{}')::uuid from asset_state where key='dualManifest');
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',false);
do $$declare t uuid; m uuid; denied boolean:=false;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';select (value#>>'{}')::uuid into m from asset_state where key='dualManifest';
 begin perform public.mobile_download_asset_page(t,m);exception when insufficient_privilege then denied:=true;end;assert denied,'Expired manifest returned assets';
 raise notice 'PASS expiry denial';
end$$;
reset role;
-- An event selection remains pinned even if an attached song remains visible.
select set_config('request.jwt.claim.sub','',false);
update public.events set approval_status='approved' where id='73000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',false);
insert into asset_state select 'eventManifest',public.mobile_download_page((value#>>'{}')::uuid,'{"kind":"event","id":"73000000-0000-4000-8000-000000000001"}')->'manifestId' from asset_state where key='teamA';
do $$declare t uuid; m uuid; assets jsonb;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';select (value#>>'{}')::uuid into m from asset_state where key='eventManifest';
 assets:=public.mobile_download_asset_page(t,m)->'assets';
 assert jsonb_array_length(assets)=1,'Event attachment missing';
 assert assets->0->>'entityType'='event' and assets->0->>'entityId'='73000000-0000-4000-8000-000000000001','Display parent must exist in the selected event manifest';
 assert not exists(select 1 from public.mobile_download_records where manifest_id=m and entity_type='song'),'Regression requires event-only frozen records';
 raise notice 'PASS event-only dual attachment uses its frozen display parent';
end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
update public.events set deleted_at=now() where id='73000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',false);
do $$declare t uuid; m uuid; denied boolean:=false;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';select (value#>>'{}')::uuid into m from asset_state where key='eventManifest';
 begin perform public.mobile_download_asset_page(t,m);exception when insufficient_privilege then denied:=true;end;assert denied,'Deleted selection was still accepted';
 raise notice 'PASS deleted selection denial';
end$$;
reset role;
-- Frozen pages use stable IDs, bounded 100-row pages and a one-row probe.
select set_config('request.jwt.claim.sub','',false);
do $$declare t uuid;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';
 insert into public.practice_files(team_id,song_id,storage_path,file_name,mime_type,size_bytes,uploaded_by)
 select t,'72000000-0000-4000-8000-000000000001',t||'/probe-'||n||'.pdf','Probe-'||n||'.pdf','application/pdf',40,'71000000-0000-4000-8000-000000000001' from generate_series(1,101) n;
 insert into storage.objects(bucket_id,name,metadata)
 select 'practice-files',t||'/probe-'||n||'.pdf','{"mimetype":"application/pdf","size":40,"eTag":"probe"}' from generate_series(1,101) n;
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',false);
do $$declare t uuid; m uuid; first jsonb; second jsonb; ids integer; denied boolean:=false;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';
 m:=(public.mobile_download_page(t,'{"kind":"song","id":"72000000-0000-4000-8000-000000000001"}')->>'manifestId')::uuid;
 first:=public.mobile_download_asset_page(t,m);second:=public.mobile_download_asset_page(t,m,first->>'nextId');
 assert jsonb_array_length(first->'assets')=100 and jsonb_array_length(second->'assets')=6,'Asset page bounds/probe failed';
 assert second->'nextId'='null'::jsonb,'Final asset page returned cursor';
 select count(distinct a->>'assetId') into ids from jsonb_array_elements((first->'assets')||(second->'assets')) a;
 assert ids=106,'Asset pages skipped/duplicated IDs';
 begin perform public.mobile_download_asset_page(t,m,'not_in_manifest');exception when invalid_parameter_value then denied:=true;end;assert denied,'Unknown asset cursor accepted';
 insert into asset_state values('pageManifest',to_jsonb(m));
 raise notice 'PASS bounded frozen pages, exact cursor and no duplicate assets';
end$$;
reset role;
-- Old manifests cannot falsely claim an empty complete asset snapshot after upgrade.
update public.mobile_download_manifests set assets_frozen=false where id=(select (value#>>'{}')::uuid from asset_state where key='pageManifest');
set role authenticated;
do $$declare t uuid; m uuid; denied boolean:=false;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';select (value#>>'{}')::uuid into m from asset_state where key='pageManifest';
 begin perform public.mobile_download_asset_page(t,m);exception when insufficient_privilege then denied:=true;end;assert denied,'Unfrozen upgrade manifest returned false completion';
 raise notice 'PASS upgrade manifest restart required';
end$$;
reset role;
-- Physical file-row deletion and Storage deletion both revoke a frozen source.
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',false);
insert into asset_state select 'deleteManifest',public.mobile_download_page((value#>>'{}')::uuid,'{"kind":"song","id":"72000000-0000-4000-8000-000000000001"}')->'manifestId' from asset_state where key='teamA';
reset role;
select set_config('request.jwt.claim.sub','',false);
delete from public.practice_files where id='76000000-0000-4000-8000-000000000002';
delete from storage.objects where name like '%/chart.pdf';
set role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',false);
do $$declare t uuid; m uuid; denied boolean;begin
 select (value#>>'{}')::uuid into t from asset_state where key='teamA';select (value#>>'{}')::uuid into m from asset_state where key='deleteManifest';
 denied:=false;begin perform public.mobile_download_asset_source(t,m,'file_76000000000040008000000000000002');exception when insufficient_privilege then denied:=true;end;assert denied,'Deleted file row retained access';
 denied:=false;begin perform public.mobile_download_asset_source(t,m,'file_76000000000040008000000000000001');exception when serialization_failure then denied:=true;end;assert denied,'Deleted object must return retry, not account revocation';
 raise notice 'PASS deleted file row and deleted object denial';
end$$;
reset role;
