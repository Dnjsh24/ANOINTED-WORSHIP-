\set ON_ERROR_STOP on
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$declare team uuid; member uuid; command jsonb; base jsonb; result jsonb; value jsonb; event_id uuid:=gen_random_uuid(); setlist_id uuid:=gen_random_uuid();
begin
 select id into team from public.teams where code='QA-54321';
 select id into member from public.team_members where team_id=team and profile_id='10000000-0000-4000-8000-000000000003';
 perform public.set_team_permission_override(team,null,member,'songs.create',false);
 value:=jsonb_build_object('name','Setlist cascade event','type','service','event_date','2026-10-18','starts_at','09:00','ends_at',null,'location',null,'description',null,'rehearsal_date',null,'rehearsal_time',null,'rehearsal_end_time',null,'assignments','[]'::jsonb);
 result:=public.mobile_apply_command(team,jsonb_build_object('commandId',gen_random_uuid(),'entityType','event','entityId',event_id,'baseRevision',0,'baseValue',null,'value',value));
 assert result->>'status'='applied';
 value:=jsonb_build_object('name','Setlist deletion','setlist_date','2026-10-18','event_id',event_id,'location',null,'call_time',null,'rehearsal_time',null,'service_times','[]'::jsonb,'notes',null,'leader_member_id',null,'song_ids',jsonb_build_array('30000000-0000-4000-8000-000000000002'));
 result:=public.mobile_apply_command(team,jsonb_build_object('commandId',gen_random_uuid(),'entityType','setlist','entityId',setlist_id,'baseRevision',0,'baseValue',null,'value',value));
 assert result->>'status'='applied';
 base:=result->'record';
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','setlist','entityId',setlist_id,'baseRevision',base->'revision','baseValue',base->'value','value',base->'value','operation','delete');
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied' and result->'record'->>'deleted'='true','Setlist deletion failed';
 assert exists(select 1 from public.mobile_deleted_records where entity_type='event' and entity_id=event_id),'Linked event tombstone was lost';
 assert exists(select 1 from public.mobile_deleted_records where entity_type='arrangement' and team_id=team),'Setlist child tombstone missing';
 assert public.mobile_apply_command(team,command)=result,'Cascade delete was not idempotent';
 raise notice 'PASS setlist delete uses website cascade and retains event/child tombstones; replay stable';
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
do $$declare team uuid; command jsonb; value jsonb; denied boolean:=false;
begin
 select team_id into team from public.team_members where profile_id=auth.uid();
 value:=jsonb_build_object('title','Denied','artist','Artist','original_key','C','bpm',null,'time_signature','4/4','lyrics_chords','Test','youtube_url',null,'spotify_url',null,'image_url',null,'album',null,'tags','[]'::jsonb);
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','song','entityId',gen_random_uuid(),'baseRevision',0,'baseValue',null,'value',value);
 begin perform public.mobile_apply_command(team,command); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Explicit songs.create denial was bypassed';
 raise notice 'PASS explicit member permission denial overrides admin song creation';
end$$;
reset role;
select 'LOCAL OVERRIDE AND SETLIST DELETION CHECKS COMPLETED' result;
