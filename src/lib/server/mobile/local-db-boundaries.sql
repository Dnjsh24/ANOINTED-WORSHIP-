\set ON_ERROR_STOP on
-- Continue after local-db-check.sql and local-db-entities.sql in the isolated DB.
create temporary table mobile_boundary_state(key text primary key,value jsonb);
grant all on mobile_boundary_state to authenticated;
select set_config('request.jwt.claim.sub','',false);
insert into public.team_members(team_id,profile_id,role,status)
select id,'10000000-0000-4000-8000-000000000003','band_leader','active' from public.teams where code='QA-54321';
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
do $$declare team uuid; command jsonb; result jsonb; value jsonb; denied boolean;
begin
 select team_id into team from public.team_members where profile_id=auth.uid();
 value:=jsonb_build_object('name','Band leader request','type','rehearsal','event_date','2026-10-18','starts_at','09:00','ends_at',null,'location',null,'description',null,'rehearsal_date',null,'rehearsal_time',null,'rehearsal_end_time',null,'assignments','[]'::jsonb);
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','event','entityId',gen_random_uuid(),'baseRevision',0,'baseValue',null,'value',value);
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied','Band leader event request was denied';
 assert (select approval_status from public.events where id=(result->'record'->>'id')::uuid)='pending','Band leader request bypassed approval';
 insert into mobile_boundary_state values('memberEvent',result->'record');
 raise notice 'PASS band leader events.request creates pending draft';
 -- An explicit event selection includes its graph but never another actor annotations.
 result:=public.mobile_download_page(team,'{"kind":"event","id":"40000000-0000-4000-8000-000000000001"}');
 assert not exists(select 1 from jsonb_array_elements(result->'records') r where r->>'entityType'='annotation'),'Another actor annotations leaked';
 insert into mobile_boundary_state values('memberManifest',result);
 insert into mobile_boundary_state values('team',to_jsonb(team));
 raise notice 'PASS same-team annotation privacy';
end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
update public.team_members set role='dancer' where profile_id='10000000-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
do $$declare team uuid; command jsonb; result jsonb; value jsonb;
begin
 select team_id into team from public.team_members where profile_id=auth.uid();
 value:=jsonb_build_object('title','Dancer chart','song_id',null,'event_id',null,'choreography_notes',null,'formation_notes',null,'outfit_notes',null,'song_title',null,'song_artist',null,'song_version',null,'video_url',null);
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','dance','entityId',gen_random_uuid(),'baseRevision',0,'baseValue',null,'value',value);
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied','Dancer default permission failed';
 assert result->'record'->'value'->'choreography_notes'='null'::jsonb,'Validation placeholder was stored';
 raise notice 'PASS dancer creates chart, nullable choreography remains null';
end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
insert into public.custom_roles(id,team_id,name,permissions)
select '90000000-0000-4000-8000-000000000001',id,'Mobile delegation',array['events.request','dance_notes.manage'] from public.teams where code='QA-54321';
update public.team_members set role='member',custom_role_id='90000000-0000-4000-8000-000000000001' where profile_id='10000000-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
do $$declare team uuid; command jsonb; result jsonb; value jsonb;
begin
 select team_id into team from public.team_members where profile_id=auth.uid();
 select s.value->'value' into value from mobile_boundary_state s where key='memberEvent';
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','event','entityId',gen_random_uuid(),'baseRevision',0,'baseValue',null,'value',value);
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied','Custom-role events.request failed';
 value:=jsonb_build_object('title','Custom dancer','song_id',null,'event_id',null,'choreography_notes','Steps','formation_notes',null,'outfit_notes',null,'song_title',null,'song_artist',null,'song_version',null,'video_url',null);
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','dance','entityId',gen_random_uuid(),'baseRevision',0,'baseValue',null,'value',value);
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied','Custom-role dance_notes.manage failed';
 raise notice 'PASS custom-role request and choreography grants';
end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
-- Withdraw the event's read visibility without removing team membership.
update public.events set approval_status='pending' where id='40000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
do $$declare team uuid; manifest jsonb; denied boolean:=false;
begin
 select (value#>>'{}')::uuid into team from mobile_boundary_state where key='team';
 select value into manifest from mobile_boundary_state where key='memberManifest';
 begin perform public.mobile_download_page(team,'{"kind":"event","id":"40000000-0000-4000-8000-000000000001"}',null,(manifest->>'manifestId')::uuid); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Frozen manifest leaked event after read revocation';
 assert not exists(select 1 from public.mobile_download_records where entity_type='event' and entity_id='40000000-0000-4000-8000-000000000001'),'Direct manifest SELECT leaked hidden event';
 assert not exists(select 1 from public.mobile_record_bases where entity_type='event' and entity_id='40000000-0000-4000-8000-000000000001'),'Direct base SELECT leaked hidden event';
 raise notice 'PASS visibility revoked between manifest pages; raw record/base RLS also denied';
end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
update public.team_members set status='inactive' where profile_id='10000000-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
do $$declare team uuid; manifest jsonb; denied boolean:=false; command jsonb; value jsonb;
begin
 select (s.value#>>'{}')::uuid into team from mobile_boundary_state s where key='team';
 select s.value into manifest from mobile_boundary_state s where key='memberManifest';
 begin perform public.mobile_download_page(team,'{"kind":"event","id":"40000000-0000-4000-8000-000000000001"}',null,(manifest->>'manifestId')::uuid); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Inactive member downloaded frozen manifest';
 assert not exists(select 1 from public.mobile_command_receipts),'Inactive member read command receipt';
 assert not exists(select 1 from public.mobile_record_bases),'Inactive member read old bases';
 assert not exists(select 1 from public.mobile_download_records),'Inactive member read frozen records';
 assert not exists(select 1 from public.mobile_annotations),'Inactive member read annotations';
 raise notice 'PASS membership revoked denies page, receipts, bases, records and annotations';
end$$;
reset role;
select 'LOCAL PERMISSION AND READ REVOCATION CHECKS COMPLETED' result;
