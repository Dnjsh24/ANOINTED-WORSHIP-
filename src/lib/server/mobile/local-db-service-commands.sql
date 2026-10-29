\set ON_ERROR_STOP on
-- Synthetic verification fixture, never a deployment migration.
create schema service_test;
grant usage on schema service_test to authenticated;
create function service_test.id(p_n integer) returns uuid language sql immutable as $$select ('92000000-0000-4000-8000-'||lpad(p_n::text,12,'0'))::uuid$$;
create table public.service_command_test_ids(key text primary key,value uuid not null);
grant select on public.service_command_test_ids to authenticated;
insert into auth.users(id,email) values
 (service_test.id(1),'command-owner-a@example.test'),(service_test.id(2),'command-owner-b@example.test'),
 (service_test.id(3),'command-member-a@example.test'),(service_test.id(4),'command-other-a@example.test');
select set_config('request.jwt.claim.sub',service_test.id(1)::text,false);
insert into public.service_command_test_ids select 'teamA',team_id from public.create_team_workspace('Service command A','SC-61017');
select set_config('request.jwt.claim.sub',service_test.id(2)::text,false);
insert into public.service_command_test_ids select 'teamB',team_id from public.create_team_workspace('Service command B','SD-61017');
select set_config('request.jwt.claim.sub',service_test.id(1)::text,false);
insert into public.team_members(team_id,profile_id,role,status)
 select value,user_id,'member','active' from public.service_command_test_ids cross join unnest(array[service_test.id(3),service_test.id(4)]) user_id where key='teamA';
insert into public.service_command_test_ids select 'ownerA',id from public.team_members where profile_id=service_test.id(1);
insert into public.service_command_test_ids select 'ownerB',id from public.team_members where profile_id=service_test.id(2);
insert into public.service_command_test_ids select 'memberA',id from public.team_members where profile_id=service_test.id(3);
insert into public.service_command_test_ids select 'otherA',id from public.team_members where profile_id=service_test.id(4);
insert into public.events(id,team_id,name,type,event_date,starts_at,created_by,approval_status)
 select event_id,value,'Service command fixture','service','2026-10-25','09:00',service_test.id(1),'approved'
 from public.service_command_test_ids cross join unnest(array[service_test.id(10),service_test.id(11)]) event_id where key='teamA';
select set_config('request.jwt.claim.sub',service_test.id(2)::text,false);
insert into public.events(id,team_id,name,type,event_date,starts_at,created_by,approval_status)
 select service_test.id(12),value,'Other team service','service','2026-10-25','09:00',service_test.id(2),'approved' from public.service_command_test_ids where key='teamB';
select set_config('request.jwt.claim.sub',service_test.id(1)::text,false);
insert into public.event_assignments(id,event_id,team_member_id,assignment)
 select service_test.id(20),service_test.id(10),value,'Media' from public.service_command_test_ids where key='memberA';

create table service_test.cases(name text primary key,identity jsonb not null,command jsonb not null,result jsonb not null);
create table service_test.race_command(command jsonb,base_revision integer);
create table service_test.race_results(value jsonb);
grant select,insert on service_test.cases,service_test.race_results to authenticated;
grant select on service_test.race_command to authenticated;
create function service_test.make_order(p_n integer,p_type text default 'service.order.save') returns jsonb language sql stable as $$
 select jsonb_build_object('commandId',service_test.id(p_n),'eventId',service_test.id(10),'baseEventRevision',e.sync_revision,'dependsOn','[]'::jsonb,
 'type',p_type,'baseOrder',(select to_jsonb(o) from public.service_orders o where event_id=e.id),
 'value',jsonb_build_object('entries',jsonb_build_array(jsonb_build_object('id',service_test.id(30),'kind','prayer','title','Opening prayer',
 'slot_id',null,'duration_seconds',90,'responsible_member_id',null,'cue','Keep this note')),'requiredRoles',jsonb_build_array('Media')))
 ||case when p_type='service.order.request' then jsonb_build_object('reason','Proposed offline') else '{}'::jsonb end
 from public.events e where e.id=service_test.id(10);
$$;
create function service_test.make_assignment(p_n integer) returns jsonb language sql stable as $$
 select jsonb_build_object('commandId',service_test.id(p_n),'eventId',a.event_id,'baseEventRevision',e.sync_revision,'dependsOn','[]'::jsonb,
 'type','service.assignment.respond','baseAssignment',jsonb_build_object('id',a.id,'eventId',a.event_id,'memberId',a.team_member_id,'assignment',a.assignment),
 'baseResponse',(select jsonb_build_object('state',r.state,'note',r.note) from public.assignment_responses r where r.assignment_id=a.id),
 'responseVersion',jsonb_build_object('assignmentId',a.id,'memberId',a.team_member_id,'revision',coalesce(s.revision,0),'deleted',coalesce(s.deleted,true)),
 'value',jsonb_build_object('state','confirmed','note','Offline confirmation'))
 from public.event_assignments a join public.events e on e.id=a.event_id
 left join public.mobile_service_assignment_state s on s.assignment_id=a.id and s.member_id=a.team_member_id where a.id=service_test.id(20);
$$;
create function service_test.capture(p_name text,p_command jsonb) returns jsonb language plpgsql as $$
declare r jsonb; t uuid; m uuid;
begin
 select value into t from public.service_command_test_ids where key='teamA';
 select id into m from public.team_members where team_id=t and profile_id=auth.uid() and status='active';
 r:=public.mobile_apply_service_commands(t,m,jsonb_build_array(p_command))->0;
 insert into service_test.cases values(p_name,jsonb_build_object('userId',auth.uid(),'teamId',t,'memberId',m),p_command,r);
 return r;
end;
$$;
-- Test-only count helper; production receipt tables remain inaccessible.
create function service_test.receipt_count() returns bigint language sql security definer set search_path='' as $$
 select count(*) from public.mobile_workflow_command_receipts where actor_id=auth.uid();
$$;
set role authenticated;
do $$declare c jsonb; r jsonb; first_result jsonb; t uuid; m uuid; denied boolean; n bigint;
begin
 select value into t from public.service_command_test_ids where key='teamA'; select value into m from public.service_command_test_ids where key='ownerA';
 c:=service_test.make_order(100); r:=service_test.capture('order-initial',c); first_result:=r;
 assert r->>'status'='applied' and r->'outcome'->>'kind'='order' and (r->'outcome'->'order'->>'revision')::integer=1,'first order not saved';
 assert public.mobile_apply_service_commands(t,m,jsonb_build_array(c))->0=first_result,'retry result changed';
 assert (select revision=1 from public.service_orders where event_id=service_test.id(10)),'retry duplicated order write';
 c:=jsonb_set(c,'{value,entries,0,title}','"Changed intent"'); r:=service_test.capture('command-id-conflict',c);
 assert r->>'code'='command_id_conflict','changed intent reused ID';
 c:=service_test.make_order(101); perform public.save_service_order(service_test.id(10),1,'[]','{}');
 r:=service_test.capture('order-conflict',c);
 assert r->>'status'='conflict' and r->'baseValue'->>'revision'='1' and r->'remote'->'order'->>'revision'='2','concurrent website order not preserved';
 c:=service_test.make_order(102); c:=jsonb_set(c,'{dependsOn}',jsonb_build_array(service_test.id(199)));
 r:=service_test.capture('missing-dependency',c); assert r->>'status'='blocked','missing dependency applied';
 c:=service_test.make_order(103); c:=jsonb_set(c,'{value,entries,0,responsible_member_id}',to_jsonb(service_test.id(999)));
 r:=service_test.capture('invalid-member',c); assert r->>'code'='invalid','foreign/absent responsible member accepted';
 assert (select revision=2 from public.service_orders where event_id=service_test.id(10)),'invalid command partially wrote order';
 c:=service_test.make_order(104); c:=jsonb_set(c,'{dependsOn}',jsonb_build_array(service_test.id(100)));
 r:=service_test.capture('confirmed-dependency',c); assert r->>'status'='applied','confirmed dependency refused';
 c:=service_test.make_order(105); n:=service_test.receipt_count();
 denied:=false; begin
  perform public.mobile_apply_service_commands(t,m,jsonb_build_array(c,jsonb_set(service_test.make_order(106),'{unexpected}','true')));
 exception when sqlstate '22023' then denied:=true; end;
 assert denied and service_test.receipt_count()=n,'malformed batch partially applied';
 foreach c in array array[
  jsonb_build_array(service_test.make_order(107),service_test.make_order(107)),
  jsonb_build_array(jsonb_set(service_test.make_order(108),'{dependsOn}',jsonb_build_array(service_test.id(109))),service_test.make_order(109)),
  jsonb_build_array(jsonb_set(service_test.make_order(110),'{dependsOn}',jsonb_build_array(service_test.id(110)))),
  jsonb_build_array(jsonb_set(service_test.make_order(111),'{baseOrder,team_id}',to_jsonb((select value from public.service_command_test_ids where key='teamB'))))
 ] loop
  denied:=false;begin perform public.mobile_apply_service_commands(t,m,c);exception when sqlstate '22023' then denied:=true;end;assert denied,'malformed service scope/ID/dependency accepted';
 end loop;
 denied:=false;begin perform public.mobile_apply_service_commands(t,(select value from public.service_command_test_ids where key='memberA'),jsonb_build_array(service_test.make_order(112)));exception when insufficient_privilege then denied:=true;end;assert denied,'foreign membership selected';
 denied:=false;begin perform 1 from public.mobile_workflow_command_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'receipt table exposed';
 assert not has_function_privilege('anon','public.mobile_apply_service_commands(uuid,uuid,jsonb)','execute')
  and not has_function_privilege('authenticated','private.apply_mobile_service_command(uuid,uuid,jsonb)','execute'),'RPC helper grants exposed';
 raise notice 'PASS shared order writes, immutable retries, conflicts, dependencies, invalid-reference rollback, malformed batch and private grants';
end$$;
reset role;
-- A website change to an unrelated event field must not erase or conflict with
-- an independently versioned service order edit.
insert into service_test.race_command select service_test.make_order(113),(select revision from public.service_orders where event_id=service_test.id(10));
update public.events set description='Independent website description' where id=service_test.id(10);
set role authenticated;
do $$declare r jsonb;begin
 r:=service_test.capture('independent-parent-change',(select command from service_test.race_command));
 assert r->>'status'='applied','independent parent description caused order conflict';
 assert (select description='Independent website description' from public.events where id=service_test.id(10)),'order save erased website description';
end$$;
reset role;
truncate service_test.race_command;

select set_config('request.jwt.claim.sub',service_test.id(3)::text,false);
set role authenticated;
do $$declare c jsonb; r jsonb; nonce uuid; n bigint;
begin
 c:=service_test.make_order(120); r:=service_test.capture('member-cannot-save-order',c);assert r->>'code'='permission','member changed leader order';
 c:=service_test.make_order(121,'service.order.request'); r:=service_test.capture('member-request',c);
 assert r->>'status'='applied' and r->'outcome'->>'kind'='request' and r->'outcome'->'request'->>'status'='pending','member proposal not submitted';
 assert (select count(*)=1 from public.shared_edit_requests where request_nonce=service_test.id(121)),'proposal duplicated';
 assert not private.can_review_shared_edit((select value from public.service_command_test_ids where key='teamA'),'service_order')
  and not private.can_review_shared_edit((select value from public.service_command_test_ids where key='teamB'),'service_order'),'predicate granted member review authority';
 c:=service_test.make_order(122,'service.order.request'); c:=jsonb_set(c,'{baseOrder,revision}','1');r:=service_test.capture('stale-member-request',c);
 assert r->'outcome'->'request'->>'status'='needs_revision','stale proposal fabricated current save';
 c:=service_test.make_order(123,'service.order.request');
 nonce:=public.submit_shared_edit_request('service_order',service_test.id(10),(c->'baseOrder'->>'revision')::bigint,
  jsonb_build_object('entries',c->'value'->'entries','required_roles',c->'value'->'requiredRoles'),c->>'reason',(c->>'commandId')::uuid);
 r:=service_test.capture('existing-web-request',c);assert r->'outcome'->'request'->>'id'=nonce::text,'existing web nonce duplicated';
 c:=service_test.make_assignment(130);r:=service_test.capture('assignment-initial',c);
 assert r->>'status'='applied' and r->'outcome'->'responseVersion'->>'revision'='1','never-observed response not saved';
 assert public.mobile_apply_service_commands((select value from public.service_command_test_ids where key='teamA'),(select value from public.service_command_test_ids where key='memberA'),jsonb_build_array(c))->0=r,'response retry changed result';
 assert (select sync_revision=1 from public.assignment_responses where assignment_id=service_test.id(20)),'retry advanced response';
 c:=service_test.make_assignment(131);perform public.respond_assignment(service_test.id(20),'declined','Website response');r:=service_test.capture('assignment-conflict',c);
 assert r->>'status'='conflict' and r->'remote'->'response'->>'note'='Website response' and r->'remote'->'responseVersion'->>'revision'='2','website response conflict lost';
 raise notice 'PASS member proposals use existing website review flow and response CAS preserves website changes';
end$$;
reset role;
-- Move the assignment: deleted state still points at event10, current assignment
-- points at event11. Both the reader and command must preserve durable revision3.
select set_config('request.jwt.claim.sub',service_test.id(1)::text,false);
update public.event_assignments set event_id=service_test.id(11) where id=service_test.id(20);
select set_config('request.jwt.claim.sub',service_test.id(3)::text,false);
set role authenticated;
do $$declare c jsonb; r jsonb;begin
 c:=service_test.make_assignment(132);assert c->'responseVersion'->>'revision'='3' and c->'baseResponse'='null','moved response tombstone lost';
 r:=service_test.capture('moved-assignment-response',c);assert r->>'status'='applied' and r->'outcome'->'responseVersion'->>'revision'='4','moved response reset or refused';
 c:=service_test.make_assignment(133); c:=jsonb_set(c,'{baseAssignment,assignment}','"Old label"');r:=service_test.capture('assignment-label-conflict',c);assert r->>'status'='conflict','stale assignment label ignored';
end$$;
reset role;

-- An already reviewed web request must never be returned as newly pending.
select set_config('request.jwt.claim.sub',service_test.id(3)::text,false);
insert into service_test.race_command select service_test.make_order(124,'service.order.request'),0;
select public.submit_shared_edit_request('service_order',service_test.id(10),(command->'baseOrder'->>'revision')::bigint,
 jsonb_build_object('entries',command->'value'->'entries','required_roles',command->'value'->'requiredRoles'),command->>'reason',(command->>'commandId')::uuid) from service_test.race_command;
select set_config('request.jwt.claim.sub',service_test.id(1)::text,false);
select public.review_shared_edit_request((select id from public.shared_edit_requests where request_nonce=service_test.id(124)),'rejected','Reviewed on website');
select set_config('request.jwt.claim.sub',service_test.id(3)::text,false);
set role authenticated;
do $$declare r jsonb;begin
 r:=service_test.capture('already-reviewed-web-request',(select command from service_test.race_command));assert r->>'code'='command_id_conflict','reviewed request pretended pending';
end$$;
reset role;
truncate service_test.race_command;

-- Revoked membership blocks even a prior successful private receipt replay.
select set_config('request.jwt.claim.sub',service_test.id(1)::text,false);
update public.team_members set status='inactive' where id=(select value from public.service_command_test_ids where key='memberA');
select set_config('request.jwt.claim.sub',service_test.id(3)::text,false);
set role authenticated;
do $$declare denied boolean:=false;begin
 begin perform public.mobile_apply_service_commands((select value from public.service_command_test_ids where key='teamA'),(select value from public.service_command_test_ids where key='memberA'),
  jsonb_build_array((select command from service_test.cases where name='member-request')));exception when insufficient_privilege then denied:=true;end;
 assert denied,'revoked membership replayed private receipt';
end$$;
reset role;
select set_config('request.jwt.claim.sub',service_test.id(1)::text,false);
update public.team_members set status='active' where id=(select value from public.service_command_test_ids where key='memberA');
set role authenticated;
do $$declare c jsonb; r jsonb;begin
 c:=jsonb_set(service_test.make_order(140),'{eventId}',to_jsonb(service_test.id(12))); c:=jsonb_set(c,'{baseOrder}','null');
 r:=service_test.capture('cross-team-event',c);assert r->>'code'='unavailable' and not(r ? 'remote'),'foreign event disclosed';
end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
set role anon;
do $$declare denied boolean:=false;begin
 begin perform public.mobile_apply_service_commands(gen_random_uuid(),gen_random_uuid(),'[]');exception when insufficient_privilege then denied:=true;end;
 assert denied,'anonymous command execution allowed';
end$$;
reset role;
-- The unchanged SELECT policy must allow own requests and genuine reviewers,
-- while still hiding another member's and another team's request bodies.
select set_config('request.jwt.claim.sub',service_test.id(4)::text,false);
set role authenticated;
do $$begin
 assert not exists(select 1 from public.shared_edit_requests where requested_by=service_test.id(3)),'another member request leaked';
end$$;
reset role;
select set_config('request.jwt.claim.sub',service_test.id(2)::text,false);
set role authenticated;
do $$begin
 assert not exists(select 1 from public.shared_edit_requests where team_id=(select value from public.service_command_test_ids where key='teamA')),'foreign owner read another team request';
 assert not private.can_review_shared_edit((select value from public.service_command_test_ids where key='teamA'),'service_order'),'foreign owner gained reviewer authority';
end$$;
reset role;

-- Legal direct saves retain the website's larger order limit; proposals retain
-- their own smaller bound. Neither bound may silently truncate the saved data.
select set_config('request.jwt.claim.sub',service_test.id(1)::text,false);
set role authenticated;
do $$declare c jsonb; r jsonb; items jsonb; denied boolean:=false; n bigint; current_revision integer;
begin
 select jsonb_agg(jsonb_build_object('id',service_test.id(1000+i),'kind','prayer','title','Large legal entry '||i,
  'slot_id',null,'duration_seconds',90,'responsible_member_id',null,'cue',repeat('x',2000)) order by i) into items from generate_series(1,200) i;
 assert octet_length(items::text)>262144 and octet_length(items::text)<500000,'large-order fixture does not exercise distinct limits';
 c:=jsonb_set(service_test.make_order(150),'{value,entries}',items);r:=service_test.capture('large-direct-order',c);
 assert r->>'status'='applied' and r->'outcome'->'order'->'entries'=items,'legal large direct order rejected or truncated';
 c:=service_test.make_order(151,'service.order.request');c:=jsonb_set(c,'{value,entries}',items);n:=service_test.receipt_count();
 begin perform public.mobile_apply_service_commands((select value from public.service_command_test_ids where key='teamA'),(select value from public.service_command_test_ids where key='ownerA'),jsonb_build_array(c));
 exception when sqlstate '22023' then denied:=true;end;
 assert denied and service_test.receipt_count()=n,'oversize proposal partially applied or accepted';
 select revision into current_revision from public.service_orders where event_id=service_test.id(10);
 perform public.save_service_order(service_test.id(10),current_revision,'[]','{}');
 raise notice 'PASS legal large website-order saves and bounded proposal rejection without data truncation';
end$$;
reset role;
select set_config('request.jwt.claim.sub',service_test.id(1)::text,false);
insert into service_test.race_command select service_test.make_order(190),(select revision from public.service_orders where event_id=service_test.id(10));
select 'SERVICE COMMAND SQL/RLS CHECKS COMPLETED; CONCURRENCY FIXTURE READY' result;
