\set ON_ERROR_STOP on
set timezone='UTC';
-- Disposable synthetic loopback fixture only. No hosted data or network services.
create schema member_request_batch_test;
create function member_request_batch_test.id(n integer) returns uuid language sql immutable as $$select ('99200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table member_request_batch_test.ids(key text primary key,id uuid not null);
create table member_request_batch_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
grant usage on schema member_request_batch_test to authenticated;
grant select,insert on member_request_batch_test.ids,member_request_batch_test.cases to authenticated;
insert into auth.users(id,email) select member_request_batch_test.id(n),'batch-'||n||'@example.test' from generate_series(1,119) n;
select set_config('request.jwt.claim.sub',member_request_batch_test.id(1)::text,false);
insert into member_request_batch_test.ids select 'team',team_id from public.create_team_workspace('Batch A','BA-61022');
select set_config('request.jwt.claim.sub',member_request_batch_test.id(2)::text,false);
insert into member_request_batch_test.ids select 'other',team_id from public.create_team_workspace('Batch B','BB-61022');
create function member_request_batch_test.team() returns uuid language sql stable as $$select id from member_request_batch_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',member_request_batch_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status,ministry,ministries,team_anniversary) values
 (member_request_batch_test.id(10),member_request_batch_test.team(),member_request_batch_test.id(3),'member','active','Delegate',array['Retained'],'2025-01-01'),
 (member_request_batch_test.id(11),member_request_batch_test.team(),member_request_batch_test.id(4),'admin','active','Admin',array['Preserved'],'2025-01-01'),
 (member_request_batch_test.id(12),member_request_batch_test.team(),member_request_batch_test.id(6),'admin','inactive','Existing admin',array['Protected'],'2025-01-01');
insert into public.join_requests(id,team_id,profile_id,requested_role) values
 (member_request_batch_test.id(100),member_request_batch_test.team(),member_request_batch_test.id(5),'member'),
 (member_request_batch_test.id(101),member_request_batch_test.team(),member_request_batch_test.id(6),'member'),
 (member_request_batch_test.id(102),member_request_batch_test.team(),member_request_batch_test.id(7),'member'),
 (member_request_batch_test.id(103),member_request_batch_test.team(),member_request_batch_test.id(8),'member'),
 (member_request_batch_test.id(104),member_request_batch_test.team(),member_request_batch_test.id(9),'owner'),
 (member_request_batch_test.id(110),member_request_batch_test.team(),member_request_batch_test.id(10),'member'),
 (member_request_batch_test.id(111),member_request_batch_test.team(),member_request_batch_test.id(11),'member'),
 (member_request_batch_test.id(113),member_request_batch_test.team(),member_request_batch_test.id(13),'member'),
 (member_request_batch_test.id(114),member_request_batch_test.team(),member_request_batch_test.id(14),'band_member'),
 (member_request_batch_test.id(115),member_request_batch_test.team(),member_request_batch_test.id(15),'member'),
 (member_request_batch_test.id(116),member_request_batch_test.team(),member_request_batch_test.id(16),'member'),
 (member_request_batch_test.id(117),member_request_batch_test.team(),member_request_batch_test.id(17),'member');
insert into public.join_requests(id,team_id,profile_id,requested_role) select member_request_batch_test.id(112),id,member_request_batch_test.id(12),'member' from member_request_batch_test.ids where key='other';
insert into public.join_requests(id,team_id,profile_id,requested_role) select member_request_batch_test.id(1000+n),member_request_batch_test.team(),member_request_batch_test.id(20+n),'member' from generate_series(0,99) n;
create function member_request_batch_test.single(n integer,target integer) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',member_request_batch_test.team(),'memberId',(select id from public.team_members where team_id=member_request_batch_test.team() and profile_id=auth.uid() and status='active'),
 'requestNonce',member_request_batch_test.id(n),'requestId',member_request_batch_test.id(target),'decision','approved','base',(select jsonb_build_object('profileId',profile_id,'requestedRole',requested_role,'requestedAt',created_at,'status','pending') from public.join_requests where id=member_request_batch_test.id(target)))
$$;
create function member_request_batch_test.request(n integer,decisions jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',member_request_batch_test.team(),'memberId',(select id from public.team_members where team_id=member_request_batch_test.team() and profile_id=auth.uid() and status='active'),'requestNonce',member_request_batch_test.id(n),'decisions',decisions)
$$;
create function member_request_batch_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_member_request_batch((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function member_request_batch_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=member_request_batch_test.rpc(request);insert into member_request_batch_test.cases values(label,request,result);return result;end$$;
create function member_request_batch_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform member_request_batch_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected batch denial '||expected;end$$;
create table member_request_batch_test.saved(request jsonb);
insert into member_request_batch_test.saved select member_request_batch_test.request(500,jsonb_build_array(
 member_request_batch_test.single(200,100),member_request_batch_test.single(201,101),jsonb_set(member_request_batch_test.single(202,102),'{base,requestedAt}','"2020-01-01T00:00:00Z"'),member_request_batch_test.single(203,103),member_request_batch_test.single(204,104)));
grant select on member_request_batch_test.saved to authenticated;
delete from public.join_requests where id=member_request_batch_test.id(103);
set role authenticated;
do $$declare req jsonb;result jsonb;prior_member jsonb;prior_state jsonb;begin
 select request into req from member_request_batch_test.saved;
 select to_jsonb(m) into prior_member from public.team_members m where id=member_request_batch_test.id(12);
 result:=member_request_batch_test.capture('mixed-terminal-results',req);
 assert (select array_agg(value->>'status' order by ordinality) from jsonb_array_elements(result->'receipts') with ordinality)=array['applied','blocked','conflict','missing','blocked'],'Mixed batch falsely claimed all approved';
 assert prior_member=(select to_jsonb(m) from public.team_members m where id=member_request_batch_test.id(12)),'Batch overwrote inactive privileged membership';
 assert exists(select 1 from public.message_channel_members c join public.team_members m on m.id=c.team_member_id where m.team_id=member_request_batch_test.team() and m.profile_id=member_request_batch_test.id(5)),'Batch lost existing channel membership side effect';
 select jsonb_build_object('members',(select jsonb_agg(to_jsonb(m) order by id) from public.team_members m where team_id=member_request_batch_test.team()),'requests',(select jsonb_agg(to_jsonb(j) order by id) from public.join_requests j where team_id=member_request_batch_test.team())) into prior_state;
 assert member_request_batch_test.rpc(req)=result,'Exact batch lostreply retry changed receipt';
 assert prior_state=jsonb_build_object('members',(select jsonb_agg(to_jsonb(m) order by id) from public.team_members m where team_id=member_request_batch_test.team()),'requests',(select jsonb_agg(to_jsonb(j) order by id) from public.join_requests j where team_id=member_request_batch_test.team())),'Exact retry repeated timestamps or writes';
 perform member_request_batch_test.denied(jsonb_set(req,'{decisions,0,base,requestedAt}','"2020-01-01T00:00:00Z"'),'22023');
 perform member_request_batch_test.denied(req||'{"role":"admin"}','22023');
 perform member_request_batch_test.denied(jsonb_set(req,'{userId}',to_jsonb(member_request_batch_test.id(2))),'42501');
 perform member_request_batch_test.denied(jsonb_set(req,'{decisions}','[]'),'22023');
 perform member_request_batch_test.denied(jsonb_set(req,'{decisions}',jsonb_build_array(req#>'{decisions,0}',req#>'{decisions,0}')),'22023');
 perform member_request_batch_test.denied(jsonb_set(req,'{decisions}',jsonb_build_array(req#>'{decisions,1}',req#>'{decisions,0}')),'22023');
 perform member_request_batch_test.denied(jsonb_set(req,'{decisions,0,decision}','"rejected"'),'22023');
 perform member_request_batch_test.denied(jsonb_set(req,'{decisions,0,requestNonce}',req->'requestNonce'),'22023');
 result:=member_request_batch_test.capture('historical-child-reuse',jsonb_set(req,'{requestNonce}',to_jsonb(member_request_batch_test.id(501))));
 assert result->'receipts'=(select receipt->'receipts' from member_request_batch_test.cases where name='mixed-terminal-results'),'Batch rewrote existing immutable child receipt';
 result:=member_request_batch_test.capture('fresh-child-conflict',member_request_batch_test.request(502,jsonb_build_array(member_request_batch_test.single(205,100))));assert result#>>'{receipts,0,status}'='conflict','New nonce silently repeated already-reviewed approval';
end$$;
reset role;
-- A malformed late child and a late channel failure each roll back earlier approvals.
create function member_request_batch_test.fail_channel() returns trigger language plpgsql as $$begin if exists(select 1 from public.team_members where id=new.team_member_id and profile_id=member_request_batch_test.id(11)) then raise exception 'Synthetic late channel failure' using errcode='23514';end if;return new;end$$;
create trigger member_request_batch_test_channel before insert on public.message_channel_members for each row execute function member_request_batch_test.fail_channel();
set role authenticated;
select member_request_batch_test.denied(member_request_batch_test.request(510,jsonb_build_array(member_request_batch_test.single(210,110),jsonb_set(member_request_batch_test.single(211,111),'{base,status}','"approved"'))),'22023');
select member_request_batch_test.denied(member_request_batch_test.request(510,jsonb_build_array(member_request_batch_test.single(210,110),member_request_batch_test.single(211,111))),'23514');
reset role;
do $$begin
 assert not exists(select 1 from public.team_members where team_id=member_request_batch_test.team() and profile_id in(member_request_batch_test.id(10),member_request_batch_test.id(11))) and (select bool_and(status='pending') from public.join_requests where id in(member_request_batch_test.id(110),member_request_batch_test.id(111))),'Late child failure left partial membership or approval';
 assert not exists(select 1 from private.mobile_member_request_decision_receipts where actor_id=member_request_batch_test.id(1) and request_nonce in(member_request_batch_test.id(210),member_request_batch_test.id(211))) and not exists(select 1 from private.mobile_member_request_batch_receipts where actor_id=member_request_batch_test.id(1) and request_nonce=member_request_batch_test.id(510)),'Late child failure left child or outer receipts';
end$$;
drop trigger member_request_batch_test_channel on public.message_channel_members;
set role authenticated;
select member_request_batch_test.capture('latefailure-exact-retry',member_request_batch_test.request(510,jsonb_build_array(member_request_batch_test.single(210,110),member_request_batch_test.single(211,111))));
select member_request_batch_test.denied(member_request_batch_test.request(511,jsonb_build_array(member_request_batch_test.single(212,112))),'42501');
select set_config('request.jwt.claim.sub',member_request_batch_test.id(3)::text,false);
select member_request_batch_test.denied(member_request_batch_test.request(520,jsonb_build_array(member_request_batch_test.single(220,113))),'42501');
reset role;
select set_config('request.jwt.claim.sub',member_request_batch_test.id(1)::text,false);
select public.set_team_permission_override(member_request_batch_test.team(),null,member_request_batch_test.id(10),'members.manage',true);
set role authenticated;
select set_config('request.jwt.claim.sub',member_request_batch_test.id(3)::text,false);
select member_request_batch_test.denied(member_request_batch_test.request(521,jsonb_build_array(member_request_batch_test.single(221,114))),'42501');
select member_request_batch_test.capture('delegated-member-approved',member_request_batch_test.request(522,jsonb_build_array(member_request_batch_test.single(222,113))));
select set_config('request.jwt.claim.sub',member_request_batch_test.id(4)::text,false);
select member_request_batch_test.capture('admin-role-approved',member_request_batch_test.request(523,jsonb_build_array(member_request_batch_test.single(223,114))));
reset role;
select set_config('request.jwt.claim.sub',member_request_batch_test.id(1)::text,false);
select public.set_team_permission_override(member_request_batch_test.team(),null,member_request_batch_test.id(11),'members.manage',true);
update public.team_members set role='member' where id=member_request_batch_test.id(11);
select public.set_team_permission_override(member_request_batch_test.team(),null,member_request_batch_test.id(10),'members.manage',false);
set role authenticated;
select set_config('request.jwt.claim.sub',member_request_batch_test.id(4)::text,false);
select member_request_batch_test.denied((select request from member_request_batch_test.cases where name='admin-role-approved'),'42501');
select set_config('request.jwt.claim.sub',member_request_batch_test.id(3)::text,false);
select member_request_batch_test.denied((select request from member_request_batch_test.cases where name='delegated-member-approved'),'42501');
reset role;
select set_config('request.jwt.claim.sub',member_request_batch_test.id(1)::text,false);
-- Exercise the actual100-item upper bound with all real side effects.
set role authenticated;
select member_request_batch_test.capture('maximum100-approved',member_request_batch_test.request(530,(select jsonb_agg(member_request_batch_test.single(3000+n,1000+n) order by n) from generate_series(0,99) n)));
select member_request_batch_test.denied(member_request_batch_test.request(531,(select jsonb_agg(member_request_batch_test.single(3200+n,1000+n) order by n) from generate_series(0,100) n)),'22023');
reset role;
do $$begin assert (select count(*)=100 and bool_and(value->>'status'='applied') from member_request_batch_test.cases,jsonb_array_elements(receipt->'receipts') where name='maximum100-approved'),'Maximum batch was partial';end$$;
delete from public.team_members where team_id=member_request_batch_test.team() and profile_id=member_request_batch_test.id(5);
delete from public.join_requests where id=member_request_batch_test.id(100);
set role authenticated;
do $$declare req jsonb;denied boolean:=false;begin
 select request into req from member_request_batch_test.cases where name='mixed-terminal-results';assert member_request_batch_test.rpc(req)=(select receipt from member_request_batch_test.cases where name='mixed-terminal-results'),'Historical batch changed';
 assert not exists(select 1 from public.team_members where team_id=member_request_batch_test.team() and profile_id=member_request_batch_test.id(5)),'Historical batch revived membership';
 begin perform 1 from private.mobile_member_request_batch_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private batch ledger readable';
end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_member_request_batch_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Immutable batch receipt edited';end$$;
select 'PASS atomic mixed approval batches, exact retries,100-item bound, complete rollback, preserved memberships, current authority and non-revival' as result;
