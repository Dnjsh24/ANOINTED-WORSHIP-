\set ON_ERROR_STOP on
-- Only the marker/path-verified disposable loopback runner may apply this fixture.
\if :service_before
create table public.service_revision_test_ids(key text primary key,value uuid not null);
grant select on public.service_revision_test_ids to authenticated;
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','service-owner-a@example.test'),
 ('91000000-0000-4000-8000-000000000002','service-owner-b@example.test'),
 ('91000000-0000-4000-8000-000000000003','service-member-a@example.test'),
 ('91000000-0000-4000-8000-000000000004','service-other-a@example.test');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',false);
insert into public.service_revision_test_ids select 'teamA',team_id from public.create_team_workspace('Service revision A','SR-61017');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',false);
insert into public.service_revision_test_ids select 'teamB',team_id from public.create_team_workspace('Service revision B','SB-61017');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',false);
insert into public.team_members(team_id,profile_id,role,status)
 select value,'91000000-0000-4000-8000-000000000003','member','active' from public.service_revision_test_ids where key='teamA';
insert into public.team_members(team_id,profile_id,role,status)
 select value,'91000000-0000-4000-8000-000000000004','member','active' from public.service_revision_test_ids where key='teamA';
insert into public.service_revision_test_ids select 'memberA',id from public.team_members where profile_id='91000000-0000-4000-8000-000000000003';
insert into public.service_revision_test_ids select 'otherA',id from public.team_members where profile_id='91000000-0000-4000-8000-000000000004';
insert into public.service_revision_test_ids select 'ownerB',id from public.team_members where profile_id='91000000-0000-4000-8000-000000000002';
insert into public.events(id,team_id,name,type,event_date,starts_at,created_by,approval_status)
 select event_id,value,'Service revision fixture','service','2026-10-25','09:00','91000000-0000-4000-8000-000000000001','approved'
 from public.service_revision_test_ids cross join unnest(array['91000000-0000-4000-8000-000000000010'::uuid,
 '91000000-0000-4000-8000-000000000011'::uuid,'91000000-0000-4000-8000-000000000012'::uuid]) event_id where key='teamA';
insert into public.event_assignments(id,event_id,team_member_id,assignment)
 select assignment_id,'91000000-0000-4000-8000-000000000010',value,case when assignment_id='91000000-0000-4000-8000-000000000024' then 'Camera' else 'Media' end
 from public.service_revision_test_ids cross join unnest(array['91000000-0000-4000-8000-000000000020'::uuid,
 '91000000-0000-4000-8000-000000000024'::uuid]) assignment_id where key='memberA';
insert into public.event_assignments(id,event_id,team_member_id,assignment)
 select '91000000-0000-4000-8000-000000000021','91000000-0000-4000-8000-000000000010',value,'Legacy role' from public.service_revision_test_ids where key='otherA';
insert into public.event_assignments(id,event_id,team_member_id,assignment)
 select '91000000-0000-4000-8000-000000000022','91000000-0000-4000-8000-000000000011',value,'Media' from public.service_revision_test_ids where key='memberA';
-- Pre-migration historical reassignment mismatch is intentional; migration must archive it.
insert into public.assignment_responses(assignment_id,team_member_id,state,note)
 select assignment_id,value,'confirmed',case when assignment_id='91000000-0000-4000-8000-000000000021' then 'Former member note' else 'Old note' end
 from public.service_revision_test_ids cross join unnest(array['91000000-0000-4000-8000-000000000020'::uuid,
 '91000000-0000-4000-8000-000000000021'::uuid,'91000000-0000-4000-8000-000000000022'::uuid,'91000000-0000-4000-8000-000000000024'::uuid]) assignment_id where key='memberA';
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',false);
insert into public.events(id,team_id,name,type,event_date,starts_at,created_by,approval_status)
 select '91000000-0000-4000-8000-000000000014',value,'Other team service','service','2026-10-25','09:00','91000000-0000-4000-8000-000000000002','approved' from public.service_revision_test_ids where key='teamB';
insert into public.event_assignments(id,event_id,team_member_id,assignment)
 select '91000000-0000-4000-8000-000000000023','91000000-0000-4000-8000-000000000014',value,'Media' from public.service_revision_test_ids where key='ownerB';
select public.respond_assignment('91000000-0000-4000-8000-000000000023','confirmed','Other team note');
select 'PRE-MIGRATION SERVICE FIXTURE READY' result;
\else
begin;
do $$begin
 assert exists(select 1 from public.assignment_responses where assignment_id='91000000-0000-4000-8000-000000000020' and sync_revision=1 and note='Old note'),'backfill changed current response';
 assert exists(select 1 from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000020' and revision=1 and not deleted and actor_id='91000000-0000-4000-8000-000000000003'),'missing backfill state';
 assert not exists(select 1 from public.assignment_responses where assignment_id='91000000-0000-4000-8000-000000000021'),'former member confirmation survived reassignment';
 assert exists(select 1 from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000021' and revision=2 and deleted),'former member tombstone missing';
 assert (select count(*) from public.mobile_service_assignment_changes where assignment_id='91000000-0000-4000-8000-000000000021' and value->>'note'='Former member note')=2,'historical reassignment lost original note/history';
 raise notice 'PASS current and stale-response backfill without lost notes';
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
do $$declare rev bigint; n bigint; denied boolean; target text; statement text;
begin
 assert exists(select 1 from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000020'),'own state hidden';
 assert not exists(select 1 from public.mobile_service_assignment_state where actor_id<>'91000000-0000-4000-8000-000000000003'),'foreign state leaked';
 assert not exists(select 1 from public.mobile_service_assignment_changes where actor_id<>'91000000-0000-4000-8000-000000000003'),'foreign history leaked';
 select count(*) into n from public.mobile_service_assignment_changes where assignment_id='91000000-0000-4000-8000-000000000020';
 perform public.respond_assignment('91000000-0000-4000-8000-000000000020','confirmed','New note');
 perform public.respond_assignment('91000000-0000-4000-8000-000000000020','confirmed','New note');
 select sync_revision into rev from public.assignment_responses where assignment_id='91000000-0000-4000-8000-000000000020';
 assert rev=3,'upsert advanced incorrectly or recorded phantom insert';
 assert (select count(*) from public.mobile_service_assignment_changes where assignment_id='91000000-0000-4000-8000-000000000020')=n+2,'upsert published phantom history';
 foreach target in array array['mobile_service_assignment_state','mobile_service_assignment_changes'] loop
  foreach statement in array array['insert into public.%I default values','update public.%I set revision=99 where false','delete from public.%I where false','truncate public.%I'] loop
   denied:=false;begin execute format(statement,target);exception when insufficient_privilege then denied:=true;end;
   assert denied,'direct client write allowed: '||target||' / '||statement;
  end loop;
 end loop;
 denied:=false;begin perform nextval('public.mobile_service_assignment_changes_cursor_seq');exception when insufficient_privilege then denied:=true;end;assert denied,'cursor sequence grant exposed';
 raise notice 'PASS own RPC upserts, exact revisions/history, denied direct INSERT/UPDATE/DELETE/TRUNCATE/sequence';
end$$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$declare denied boolean:=false;
begin
 assert not exists(select 1 from public.mobile_service_assignment_state where team_id=(select value from public.service_revision_test_ids where key='teamA')),'tenant B read A state';
 assert not exists(select 1 from public.mobile_service_assignment_changes where team_id=(select value from public.service_revision_test_ids where key='teamA')),'tenant B read A history';
 begin perform public.respond_assignment('91000000-0000-4000-8000-000000000020','declined','Foreign edit');exception when insufficient_privilege then denied:=true;end;assert denied,'tenant B changed A response';
 raise notice 'PASS two-team isolation and foreign response denied';
end$$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
do $$declare denied boolean:=false;
begin
 assert not exists(select 1 from public.mobile_service_assignment_state),'team owner read another member private state';
 begin perform public.respond_assignment('91000000-0000-4000-8000-000000000020','declined','Owner edit');exception when insufficient_privilege then denied:=true;end;assert denied,'owner changed another assigned member response';
 raise notice 'PASS ownership does not grant personal-response authority';
end$$;
reset role;
delete from public.assignment_responses where assignment_id='91000000-0000-4000-8000-000000000020';
do $$begin
 assert exists(select 1 from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000020' and revision=4 and deleted),'delete tombstone revision missing';
 assert exists(select 1 from public.mobile_service_assignment_changes where assignment_id='91000000-0000-4000-8000-000000000020' and revision=4 and operation='delete' and value->>'note'='New note'),'delete lost original value';
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
select public.respond_assignment('91000000-0000-4000-8000-000000000020','declined','Recreated note');
reset role;
do $$declare denied boolean:=false; before_count bigint;
begin
 assert (select sync_revision=5 from public.assignment_responses where assignment_id='91000000-0000-4000-8000-000000000020'),'recreate reused deleted revision';
 update public.assignment_responses set sync_revision=999,state='confirmed' where assignment_id='91000000-0000-4000-8000-000000000020';
 assert (select sync_revision=6 from public.assignment_responses where assignment_id='91000000-0000-4000-8000-000000000020'),'caller supplied revision was trusted';
 select count(*) into before_count from public.mobile_service_assignment_changes;
 begin update public.assignment_responses set team_member_id=(select value from public.service_revision_test_ids where key='otherA') where assignment_id='91000000-0000-4000-8000-000000000020';exception when invalid_parameter_value then denied:=true;end;
 assert denied and (select count(*) from public.mobile_service_assignment_changes)=before_count,'identity change altered history';
 raise notice 'PASS hard delete, recreate, revision ownership and immutable response identity';
end$$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
update public.event_assignments set team_member_id=(select value from public.service_revision_test_ids where key='otherA') where id='91000000-0000-4000-8000-000000000020';
do $$begin
 assert not exists(select 1 from public.assignment_responses where assignment_id='91000000-0000-4000-8000-000000000020'),'reassignment transferred response';
 assert exists(select 1 from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000020' and member_id=(select value from public.service_revision_test_ids where key='memberA') and deleted and revision=7),'old assignee tombstone lost';
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
select public.respond_assignment('91000000-0000-4000-8000-000000000020','pending','New assignee note');
do $$begin
 assert (select sync_revision=1 from public.assignment_responses where assignment_id='91000000-0000-4000-8000-000000000020'),'new assignee inherited old revision';
 assert not exists(select 1 from public.mobile_service_assignment_changes where actor_id<>'91000000-0000-4000-8000-000000000004'),'new assignee read old personal notes';
end$$;
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
update public.event_assignments set assignment='Production' where id='91000000-0000-4000-8000-000000000020';
do $$begin
 assert exists(select 1 from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000020' and member_id=(select value from public.service_revision_test_ids where key='otherA') and deleted and revision=2),'renamed role retained old confirmation';
end$$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
select public.respond_assignment('91000000-0000-4000-8000-000000000020','confirmed','Renamed role note');
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
update public.event_assignments set event_id='91000000-0000-4000-8000-000000000012' where id='91000000-0000-4000-8000-000000000020';
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
select public.respond_assignment('91000000-0000-4000-8000-000000000020','confirmed','Moved event note');
do $$begin
 assert exists(select 1 from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000020' and member_id=(select value from public.service_revision_test_ids where key='otherA') and revision=5 and not deleted and event_id='91000000-0000-4000-8000-000000000012'),'state did not move to current event';
 assert exists(select 1 from public.mobile_service_assignment_changes where assignment_id='91000000-0000-4000-8000-000000000020' and event_id='91000000-0000-4000-8000-000000000010' and value->>'note'='Renamed role note'),'move lost old event history';
 raise notice 'PASS reassignment, role change and event move preserve history without transferred confirmations';
end$$;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
delete from public.event_assignments where id='91000000-0000-4000-8000-000000000022';
delete from public.events where id='91000000-0000-4000-8000-000000000012';
do $$begin
 assert exists(select 1 from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000022' and deleted and revision=2),'assignment cascade lost tombstone';
 assert exists(select 1 from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000020' and member_id=(select value from public.service_revision_test_ids where key='otherA') and deleted and revision=6),'event cascade lost tombstone';
 raise notice 'PASS assignment/event hard cascades preserve tombstones';
end$$;
update public.team_members set status='inactive' where id=(select value from public.service_revision_test_ids where key='otherA');
set role authenticated;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
do $$begin assert not exists(select 1 from public.mobile_service_assignment_state),'inactive scope read state';assert not exists(select 1 from public.mobile_service_assignment_changes),'inactive scope read history';raise notice 'PASS revoked membership hides retained state/history';end$$;
reset role;
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
do $$declare denied boolean:=false; empty_team uuid:='91000000-0000-4000-8000-000000000030';
begin
 begin delete from public.teams where id=(select value from public.service_revision_test_ids where key='teamB');
 exception when insufficient_privilege then denied:=sqlerrm like '%final team owner%';end;
 assert denied,'existing final-owner deletion guard changed';
 assert exists(select 1 from public.mobile_service_assignment_state where assignment_id='91000000-0000-4000-8000-000000000023' and not deleted),'blocked team deletion changed response state';
 -- Test the new table FK purge using a separate synthetic empty scope. Do not
 -- disable the product's final-owner guard or claim populated-team deletion works.
 insert into public.teams(id,name,code,owner_id) values(empty_team,'Empty purge fixture','SC-61017','91000000-0000-4000-8000-000000000002');
 insert into public.mobile_service_assignment_state(team_id,event_id,assignment_id,member_id,actor_id,revision,deleted)
 values(empty_team,gen_random_uuid(),'91000000-0000-4000-8000-000000000031',gen_random_uuid(),'91000000-0000-4000-8000-000000000002',2,true);
 insert into public.mobile_service_assignment_changes(team_id,event_id,assignment_id,member_id,actor_id,revision,operation,value)
 select team_id,event_id,assignment_id,member_id,actor_id,revision,'delete','{"state":"confirmed","note":"Empty-scope purge fixture"}' from public.mobile_service_assignment_state where team_id=empty_team;
 delete from public.teams where id=empty_team;
 assert not exists(select 1 from public.mobile_service_assignment_state where team_id=empty_team),'empty-team FK purge retained state';
 assert not exists(select 1 from public.mobile_service_assignment_changes where team_id=empty_team),'empty-team FK purge retained history';
 assert not has_function_privilege('authenticated','private.mobile_service_response_revision()','execute') and not has_function_privilege('authenticated','private.mobile_service_response_change()','execute') and not has_function_privilege('authenticated','private.mobile_service_assignment_scope_change()','execute'),'private trigger functions callable by client';
 raise notice 'PASS existing owner guard, synthetic empty-team FK purge and private function grants';
end$$;
select set_config('request.jwt.claim.sub','',true);
set role anon;
do $$declare target text; denied boolean;
begin
 foreach target in array array['mobile_service_assignment_state','mobile_service_assignment_changes'] loop
  denied:=false;begin execute format('select 1 from public.%I',target);exception when insufficient_privilege then denied:=true;end;assert denied,'anonymous state/history read allowed';
 end loop;
 raise notice 'PASS anonymous state/history SELECT denied';
end$$;
reset role;
rollback;
select 'SERVICE REVISION SQL/RLS CHECKS COMPLETED; POST-MIGRATION FIXTURES ROLLED BACK' result;
\endif
