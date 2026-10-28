\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub','',false);
update public.team_members set role='admin',custom_role_id=null,status='active' where profile_id='10000000-0000-4000-8000-000000000003';
update public.events set approval_status='approved' where id='40000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
do $$declare team uuid; song uuid:=gen_random_uuid(); value jsonb; result jsonb; command jsonb; base jsonb;
begin
 select team_id into team from public.team_members where profile_id=auth.uid();
 value:=jsonb_build_object('title','Admin delete test','artist','Artist','original_key','C','bpm',null,'time_signature','4/4','lyrics_chords','Test','youtube_url',null,'spotify_url',null,'image_url',null,'album',null,'tags','[]'::jsonb);
 result:=public.mobile_apply_command(team,jsonb_build_object('commandId',gen_random_uuid(),'entityType','song','entityId',song,'baseRevision',0,'baseValue',null,'value',value));
 base:=result->'record';
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','song','entityId',song,'baseRevision',base->'revision','baseValue',base->'value','value',base->'value','operation','delete');
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied' and result->'record'->>'deleted'='true','Admin songs.delete default failed';
 raise notice 'PASS admin default song deletion';
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$declare team uuid; song uuid:='30000000-0000-4000-8000-000000000002'; notes jsonb; value jsonb; result jsonb; base jsonb; command jsonb; annotation uuid:=gen_random_uuid(); denied boolean;
begin
 select id into team from public.teams where code='QA-54321';
 select jsonb_agg(jsonb_build_object('id',i::text,'text',repeat(chr(1),4000),'x',0,'y',0,'font','sans','fontSize',12,'color','#facc15','bold',false,'italic',false,'underline',false,'strike',false)) into notes from generate_series(1,100) i;
 value:=jsonb_build_object('song_id',song,'setlist_id',null,'slot_id',null,'notes',notes,'drawing','data:image/png;base64,' || repeat('A',179976));
 result:=public.mobile_apply_command(team,jsonb_build_object('commandId',gen_random_uuid(),'entityType','annotation','entityId',annotation,'baseRevision',0,'baseValue',null,'value',value));
 assert result->>'status'='applied','Large escaped annotation rejected on creation';
 base:=result->'record';
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','annotation','entityId',annotation,'baseRevision',base->'revision','baseValue',base->'value','value',jsonb_set(value,'{notes,0,text}',to_jsonb(repeat(chr(2),4000))));
 assert octet_length(command::text)>5000000,'Large test did not exercise escaped base/local';
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied','Large schema-valid base/local rejected';
 raise notice 'PASS 100x4000 escaped notes plus 179997-byte drawing, base/local command % bytes',octet_length(command::text);
 value:=jsonb_set(value,'{notes,0,font}','null');
 denied:=false;
 begin perform public.mobile_apply_command(team,jsonb_build_object('commandId',gen_random_uuid(),'entityType','annotation','entityId',gen_random_uuid(),'baseRevision',0,'baseValue',null,'value',value)); exception when sqlstate '22023' then denied:=true; end;
 assert denied,'Direct RPC accepted null font';
 raise notice 'PASS malformed chart font rejected by SQL boundary';
end$$;
-- Cascades must emit child tombstones even after their FK parent disappears.
do $$declare team uuid; page jsonb; base jsonb; command jsonb; result jsonb;
begin
 select id into team from public.teams where code='QA-54321';
 page:=public.mobile_download_page(team,'{"kind":"event","id":"40000000-0000-4000-8000-000000000001"}');
 select r into base from jsonb_array_elements(page->'records') r where r->>'entityType'='event';
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','event','entityId',base->'id','baseRevision',base->'revision','baseValue',base->'value','value',base->'value','operation','delete');
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied' and result->'record'->>'deleted'='true','Event cascade tombstone absent';
 assert not exists(select 1 from public.setlists where id='50000000-0000-4000-8000-000000000001'),'Website-linked setlist cascade did not run';
 assert exists(select 1 from public.mobile_deleted_records where entity_type='setlist' and entity_id='50000000-0000-4000-8000-000000000001'),'Setlist tombstone absent';
 assert exists(select 1 from public.mobile_deleted_records where entity_type='arrangement' and entity_id='60000000-0000-4000-8000-000000000001'),'Cascaded arrangement tombstone absent';
 assert exists(select 1 from public.mobile_deleted_records where entity_type='annotation' and entity_id='70000000-0000-4000-8000-000000000001'),'Cascaded private annotation tombstone absent';
 raise notice 'PASS event cascade matches website; setlist, arrangement, annotation tombstones retained';
end$$;
-- >250 records, bounded bytes, immutable membership and no duplicate pages.
insert into public.songs(team_id,created_by,title,artist,original_key,lyrics_chords)
select t.id,auth.uid(),'Pagination ' || n,'Test','C','Test' from public.teams t cross join generate_series(1,260) n where t.code='QA-54321';
do $$declare team uuid; page jsonb; manifest uuid; total integer:=0; expected integer; seen uuid[]:='{}'; item jsonb; added uuid:=gen_random_uuid(); cursor jsonb;
begin
 select id into team from public.teams where code='QA-54321';
 page:=public.mobile_download_page(team,'{"kind":"library"}');
 manifest:=(page->>'manifestId')::uuid;
 select count(*) into expected from public.mobile_download_records where manifest_id=manifest;
 assert page->'nextCursor'<>'null'::jsonb,'Pagination fixture fit in one page';
 insert into public.songs(id,team_id,created_by,title,artist,original_key,lyrics_chords) values(added,team,auth.uid(),'After manifest','Test','C','Test');
 loop
   assert octet_length((page->'records')::text)<6400000,'Download page exceeded 6MiB plus array separators';
   assert jsonb_array_length(page->'records')<=250,'Record-count limit exceeded';
   for item in select value from jsonb_array_elements(page->'records') loop
     assert (item->>'id')::uuid<>added,'New post-manifest record changed frozen graph';
     assert not (item->>'id')::uuid=any(seen),'Duplicate entity on subsequent page';
     seen:=array_append(seen,(item->>'id')::uuid); total:=total+1;
   end loop;
   cursor:=nullif(page->'nextCursor','null');
   exit when cursor is null;
   page:=public.mobile_download_page(team,'{"kind":"library"}',cursor,manifest);
 end loop;
 assert total=expected,'Pagination omitted a frozen manifest record';
 raise notice 'PASS bounded manifest pagination: % records, no omissions/duplicates, ignores post-manifest inserts',total;
end$$;
reset role;
select 'LOCAL LIMITS AND CASCADE CHECKS COMPLETED' result;
