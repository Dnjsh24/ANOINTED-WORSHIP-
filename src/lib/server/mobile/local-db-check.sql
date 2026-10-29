\set ON_ERROR_STOP on
-- PostgreSQL18 isolated test only; auth.uid is supplied through a local claim GUC.
create temporary table mobile_verify_state(key text primary key,value jsonb);
grant all on mobile_verify_state to authenticated;
insert into auth.users(id,email) values
('10000000-0000-4000-8000-000000000001','mobile-a@example.test'),
('10000000-0000-4000-8000-000000000002','mobile-b@example.test'),
('10000000-0000-4000-8000-000000000003','mobile-member@example.test');
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
insert into mobile_verify_state select 'teamA',to_jsonb(team_id) from public.create_team_workspace('Mobile SQL A','QA-54321');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
insert into mobile_verify_state select 'teamB',to_jsonb(team_id) from public.create_team_workspace('Mobile SQL B','QB-54322');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$declare team uuid; command jsonb; result jsonb; replay jsonb; page jsonb; base jsonb; changed jsonb; conflict jsonb; denied boolean;
begin
 select (value#>>'{}')::uuid into team from mobile_verify_state where key='teamA';
 command:=jsonb_build_object('commandId','20000000-0000-4000-8000-000000000001','entityType','song','entityId','30000000-0000-4000-8000-000000000001','baseRevision',0,'baseValue',null,'value',
 jsonb_build_object('title','Original','artist','Original artist','original_key','C','bpm',120,'time_signature','4/4','lyrics_chords','[C] Hello','youtube_url',null,'spotify_url',null,'image_url',null,'album',null,'tags','[]'::jsonb));
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied','Initial song creation failed';
 assert result->'record'->>'revision'='1','First song revision is not one';
 replay:=public.mobile_apply_command(team,command);
 assert replay=result,'Idempotency did not return identical result';
 assert (select sync_revision from public.songs where id='30000000-0000-4000-8000-000000000001')=1,'Replay mutated song twice';
 raise notice 'PASS song creation, revision and idempotent replay';
 page:=public.mobile_download_page(team,jsonb_build_object('kind','song','id','30000000-0000-4000-8000-000000000001'));
 assert jsonb_array_length(page->'records')=1,'Song download record missing';
 assert page->'nextCursor'='null'::jsonb,'Single song produced extraneous cursor';
 base:=page->'records'->0;
 -- Same role and direct website table write use the existing revision trigger.
 update public.songs set artist='Website artist' where id='30000000-0000-4000-8000-000000000001';
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','song','entityId',base->'id','baseRevision',base->'revision','baseValue',base->'value','value',jsonb_set(base->'value','{title}','"Offline title"'));
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied','Independent fields were rejected';
 assert result->'record'->'value'->>'artist'='Website artist','Web artist was lost';
 assert result->'record'->'value'->>'title'='Offline title','Offline title was lost';
 assert result->'record'->>'revision'='3','Web and mobile writes did not each advance revision';
 raise notice 'PASS three-way merge preserves independent website/mobile fields';
 base:=result->'record';
 update public.songs set title='Website conflict title' where id='30000000-0000-4000-8000-000000000001';
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','song','entityId',base->'id','baseRevision',base->'revision','baseValue',base->'value','value',jsonb_set(base->'value','{title}','"Offline conflicting title"'));
 conflict:=public.mobile_apply_command(team,command);
 assert conflict->>'status'='conflict','Concurrent title edits did not conflict';
 assert conflict->'fields'='["title"]'::jsonb,'Conflict did not name title';
 assert conflict->'baseValue'=base->'value' and conflict->'localValue'=command->'value','Conflict lost base/local versions';
 assert conflict->'remote'->'value'->>'title'='Website conflict title','Conflict lost remote version';
 assert public.mobile_apply_command(team,command)=conflict,'Conflict replay changed result';
 insert into mobile_verify_state values('conflict',conflict);
 raise notice 'PASS overlapping edits preserve base, local, remote and idempotency';
 -- The conflict itself authenticates its remote version as a valid retry base.
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','song','entityId',base->'id','baseRevision',conflict->'remote'->'revision','baseValue',conflict->'remote'->'value','value',conflict->'localValue');
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied','Conflict resolution rejected the provided remote base';
 raise notice 'PASS conflict-resolution retry accepts remote base without extra download';
 -- A manifest returns its frozen value despite a later website change.
 replay:=public.mobile_download_page(team,jsonb_build_object('kind','song','id',base->'id'));
 update public.songs set album='Website album after manifest' where id='30000000-0000-4000-8000-000000000001';
 page:=public.mobile_download_page(team,jsonb_build_object('kind','song','id',base->'id'),null,(replay->>'manifestId')::uuid);
 assert page->'records'=replay->'records','Manifest records changed after web write';
 raise notice 'PASS immutable manifest after website write';
 -- Fresh downloaded base can delete; a stale upsert must never resurrect it.
 page:=public.mobile_download_page(team,jsonb_build_object('kind','song','id',base->'id'));
 base:=page->'records'->0;
 command:=jsonb_build_object('commandId',gen_random_uuid(),'entityType','song','entityId',base->'id','baseRevision',base->'revision','baseValue',base->'value','value',base->'value','operation','delete');
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='applied' and result->'record'->>'deleted'='true','Deletion did not produce tombstone';
 command:=command || jsonb_build_object('commandId',gen_random_uuid(),'operation','upsert','value',jsonb_set(base->'value','{title}','"Do not resurrect"'));
 result:=public.mobile_apply_command(team,command);
 assert result->>'status'='conflict' and result->'fields'='["$deleted"]'::jsonb,'Stale edit resurrected deleted song';
 insert into mobile_verify_state values('songTombstone',result->'remote');
 raise notice 'PASS delete tombstone and stale-edit resurrection conflict';
end$$;

-- Outsider has a valid identity and another team, but cannot read or mutate A.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$declare team uuid; denied boolean:=false; result jsonb;
begin
 select (value#>>'{}')::uuid into team from mobile_verify_state where key='teamA';
 begin perform public.mobile_download_page(team,'{"kind":"library"}'); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Other team downloaded A';
 assert (select count(*) from public.mobile_record_bases where team_id=team)=0,'RLS exposed A bases';
 assert (select count(*) from public.mobile_command_receipts where team_id=team)=0,'RLS exposed A receipts';
 assert (select count(*) from public.mobile_download_manifests where team_id=team)=0,'RLS exposed A manifests';
 assert (select count(*) from public.mobile_download_records)=0,'RLS exposed A download records';
 assert (select count(*) from public.mobile_deleted_records where team_id=team)=0,'RLS exposed A tombstones';
 denied:=false;
 begin
  perform public.mobile_apply_command(team,jsonb_build_object('commandId',gen_random_uuid(),'entityType','annotation','entityId',gen_random_uuid(),'baseRevision',0,'baseValue',null,'value',jsonb_build_object('song_id','30000000-0000-4000-8000-000000000001','setlist_id',null,'slot_id',null,'notes','[]'::jsonb,'drawing',null)));
 exception when insufficient_privilege then denied:=true; end;
 assert denied,'Other team wrote A annotation';
 raise notice 'PASS tenant B denied A RPC, bases, receipts, manifests, download rows, tombstones';
end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
set role anon;
do $$declare denied boolean:=false;
begin
 begin perform public.mobile_download_page('00000000-0000-4000-8000-000000000000','{"kind":"library"}'); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Anonymous caller could invoke download';
 raise notice 'PASS anonymous download denied by function grants';
end$$;
reset role;
select 'LOCAL SQL CHECKS COMPLETED' result;
