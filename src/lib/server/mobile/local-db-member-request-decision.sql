\set ON_ERROR_STOP on
set timezone='UTC';
-- Synthetic loopback fixture only. Never execute against hosted data.
create schema member_request_decision_test;
create function member_request_decision_test.id(n integer) returns uuid language sql immutable as $$select ('99000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table member_request_decision_test.ids(key text primary key,id uuid not null);
create table member_request_decision_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
grant usage on schema member_request_decision_test to authenticated;
grant select,insert on member_request_decision_test.ids,member_request_decision_test.cases to authenticated;
insert into auth.users(id,email) select member_request_decision_test.id(n),'decision-'||n||'@example.test' from generate_series(1,18) n;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(1)::text,false);
insert into member_request_decision_test.ids select 'team',team_id from public.create_team_workspace('Decision A','DA-61022');
select set_config('request.jwt.claim.sub',member_request_decision_test.id(2)::text,false);
insert into member_request_decision_test.ids select 'other',team_id from public.create_team_workspace('Decision B','DB-61022');
select set_config('request.jwt.claim.sub',member_request_decision_test.id(1)::text,false);
create function member_request_decision_test.team() returns uuid language sql stable as $$select id from member_request_decision_test.ids where key='team'$$;
insert into public.custom_roles(id,team_id,name,permissions) values(member_request_decision_test.id(50),member_request_decision_test.team(),'Manage only',array['members.manage']),
 (member_request_decision_test.id(51),member_request_decision_test.team(),'Review only',array['join_requests.review']);
insert into public.team_members(id,team_id,profile_id,role,status,custom_role_id,ministry,ministries,team_anniversary) values
 (member_request_decision_test.id(10),member_request_decision_test.team(),member_request_decision_test.id(3),'member','active',null,'Delegate',array['Retained'],'2025-01-01'),
 (member_request_decision_test.id(11),member_request_decision_test.team(),member_request_decision_test.id(4),'admin','active',null,null,array['Admin'],'2025-01-01'),
 (member_request_decision_test.id(12),member_request_decision_test.team(),member_request_decision_test.id(5),'band_member','active',member_request_decision_test.id(50),'Existing Guitar',array['Guitar'],'2025-01-01'),
 (member_request_decision_test.id(13),member_request_decision_test.team(),member_request_decision_test.id(6),'admin','inactive',member_request_decision_test.id(50),'Inactive admin',array['Retained'],'2025-01-01'),
 (member_request_decision_test.id(14),member_request_decision_test.team(),member_request_decision_test.id(11),'member','active',member_request_decision_test.id(50),null,null,null),
 (member_request_decision_test.id(15),member_request_decision_test.team(),member_request_decision_test.id(16),'member','active',member_request_decision_test.id(51),null,null,null);
insert into public.join_requests(id,team_id,profile_id,requested_role) values
 (member_request_decision_test.id(100),member_request_decision_test.team(),member_request_decision_test.id(7),'band_member'),
 (member_request_decision_test.id(101),member_request_decision_test.team(),member_request_decision_test.id(8),'member'),
 (member_request_decision_test.id(102),member_request_decision_test.team(),member_request_decision_test.id(5),'member'),
 (member_request_decision_test.id(103),member_request_decision_test.team(),member_request_decision_test.id(6),'member'),
 (member_request_decision_test.id(104),member_request_decision_test.team(),member_request_decision_test.id(1),'member'),
 (member_request_decision_test.id(105),member_request_decision_test.team(),member_request_decision_test.id(9),'band_member'),
 (member_request_decision_test.id(106),member_request_decision_test.team(),member_request_decision_test.id(10),'member'),
 (member_request_decision_test.id(107),member_request_decision_test.team(),member_request_decision_test.id(12),'band_member'),
 (member_request_decision_test.id(108),member_request_decision_test.team(),member_request_decision_test.id(13),'owner'),
 (member_request_decision_test.id(110),member_request_decision_test.team(),member_request_decision_test.id(15),'member'),
 (member_request_decision_test.id(111),member_request_decision_test.team(),member_request_decision_test.id(17),'member'),
 (member_request_decision_test.id(120),member_request_decision_test.team(),member_request_decision_test.id(18),'member');
insert into public.join_requests(id,team_id,profile_id,requested_role) select member_request_decision_test.id(109),id,member_request_decision_test.id(14),'member' from member_request_decision_test.ids where key='other';
create function member_request_decision_test.request(n integer,target uuid,decision text default 'approved') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',member_request_decision_test.team(),'memberId',(select id from public.team_members where team_id=member_request_decision_test.team() and profile_id=auth.uid() and status='active'),
 'requestNonce',member_request_decision_test.id(n),'requestId',target,'decision',decision,'base',(select jsonb_build_object('profileId',profile_id,'requestedRole',requested_role,'requestedAt',created_at,'status','pending') from public.join_requests where id=target))
$$;
create function member_request_decision_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_member_request_decision((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function member_request_decision_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=member_request_decision_test.rpc(request);insert into member_request_decision_test.cases values(label,request,result);return result;end$$;
create function member_request_decision_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform member_request_decision_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected decision denial '||expected;end$$;
set role authenticated;
do $$declare req jsonb;result jsonb;member_before jsonb;join_before jsonb;begin
 req:=member_request_decision_test.request(200,member_request_decision_test.id(100));result:=member_request_decision_test.capture('new-approved',req);
 perform member_request_decision_test.denied(jsonb_set(req,'{userId}',to_jsonb(member_request_decision_test.id(2))),'42501');
 perform member_request_decision_test.denied(jsonb_set(req,'{memberId}',to_jsonb(member_request_decision_test.id(11))),'42501');
 assert result->>'status'='applied' and result#>>'{membership,role}'='band_member' and result#>>'{membership,status}'='active','Exact requested membership was not created';
 assert exists(select 1 from public.message_channel_members c join public.team_members m on m.id=c.team_member_id join public.message_channels ch on ch.id=c.channel_id where m.profile_id=member_request_decision_test.id(7) and m.team_id=member_request_decision_test.team() and ch.channel_type='team'),'Existing defaultchannel side effect lost';
 select to_jsonb(m) into member_before from public.team_members m where id=(result#>>'{membership,id}')::uuid;select to_jsonb(j) into join_before from public.join_requests j where id=member_request_decision_test.id(100);
 assert member_request_decision_test.rpc(req)=result,'Lost reply changed immutable receipt';
 assert member_before=(select to_jsonb(m) from public.team_members m where id=(result#>>'{membership,id}')::uuid) and join_before=(select to_jsonb(j) from public.join_requests j where id=member_request_decision_test.id(100)),'Exact retry repeated state/timestamp writes';
 perform member_request_decision_test.denied(jsonb_set(req,'{decision}','"rejected"'),'22023');perform member_request_decision_test.denied(req||'{"role":"admin"}','22023');
 req:=jsonb_set(req,'{requestNonce}',to_jsonb(member_request_decision_test.id(201)));result:=member_request_decision_test.capture('already-reviewed-conflict',req);assert result->>'status'='conflict' and result->'membership'='null'::jsonb,'New nonce silently repeated approval';
 for req in select member_request_decision_test.request(210+n,member_request_decision_test.id(102+n)) from generate_series(0,2) n loop
  select to_jsonb(m) into member_before from public.team_members m where team_id=member_request_decision_test.team() and profile_id=(req#>>'{base,profileId}')::uuid;
  result:=member_request_decision_test.capture('existing-blocked-'||(req->>'requestId'),req);
  assert result->>'status'='blocked' and result->>'reason'='existing_membership','Existing active/inactive/owner membership not blocked';
  assert member_before=(select to_jsonb(m) from public.team_members m where team_id=member_request_decision_test.team() and profile_id=(req#>>'{base,profileId}')::uuid),'Existing membership fields were overwritten';
  assert (select status='pending' from public.join_requests where id=(req->>'requestId')::uuid),'Blocked request changed status';
 end loop;
 req:=member_request_decision_test.request(214,member_request_decision_test.id(103),'rejected');select to_jsonb(m) into member_before from public.team_members m where id=member_request_decision_test.id(13);
 result:=member_request_decision_test.capture('existing-member-rejected',req);assert result->>'status'='applied' and result->'membership'='null'::jsonb and member_before=(select to_jsonb(m) from public.team_members m where id=member_request_decision_test.id(13)),'Rejection changed inactive/privileged membership';
 req:=member_request_decision_test.request(215,member_request_decision_test.id(108),'rejected');result:=member_request_decision_test.capture('privileged-request-blocked',req);assert result->>'status'='blocked' and result->>'reason'='privileged_request','Privileged request bypassed existing RPC boundary';
 req:=member_request_decision_test.request(216,member_request_decision_test.id(109));perform member_request_decision_test.denied(req,'42501');
 req:=jsonb_set(member_request_decision_test.request(217,member_request_decision_test.id(110)),'{base,requestedAt}','"2020-01-01T00:00:00Z"');result:=member_request_decision_test.capture('stale-base-conflict',req);assert result->>'status'='conflict','Unseen pending base changed';
end$$;
reset role;
-- Both permission branches matter: custom members.manage alone is not join review.
set role authenticated;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(11)::text,false);
select member_request_decision_test.denied(member_request_decision_test.request(220,member_request_decision_test.id(105),'rejected'),'42501');
select set_config('request.jwt.claim.sub',member_request_decision_test.id(16)::text,false);
select member_request_decision_test.denied(member_request_decision_test.request(221,member_request_decision_test.id(105),'rejected'),'42501');
reset role;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(1)::text,false);
select public.set_team_permission_override(member_request_decision_test.team(),null,member_request_decision_test.id(10),'members.manage',true);
set role authenticated;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(3)::text,false);
select member_request_decision_test.denied(member_request_decision_test.request(222,member_request_decision_test.id(105)),'42501');
select member_request_decision_test.capture('delegated-rejected',member_request_decision_test.request(223,member_request_decision_test.id(105),'rejected'));
select member_request_decision_test.capture('delegated-member-approved',member_request_decision_test.request(224,member_request_decision_test.id(111)));
reset role;
-- Save a pending intent, then the actual requester cancels before native delivery.
select set_config('request.jwt.claim.sub',member_request_decision_test.id(1)::text,false);
create table member_request_decision_test.saved(request jsonb);
insert into member_request_decision_test.saved select member_request_decision_test.request(225,member_request_decision_test.id(110));
grant select on member_request_decision_test.saved to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(15)::text,false);
update public.join_requests set status='canceled' where id=member_request_decision_test.id(110);
select set_config('request.jwt.claim.sub',member_request_decision_test.id(1)::text,false);
select member_request_decision_test.capture('canceled-conflict',(select request from member_request_decision_test.saved));
reset role;
delete from public.join_requests where id=member_request_decision_test.id(110);
set role authenticated;
select member_request_decision_test.capture('missing-request',jsonb_set((select request from member_request_decision_test.saved),'{requestNonce}',to_jsonb(member_request_decision_test.id(226))));
reset role;
-- Failure in preserved default-channel side effects must roll back membership, review and ledger.
create function member_request_decision_test.fail_channel() returns trigger language plpgsql as $$begin if exists(select 1 from public.team_members where id=new.team_member_id and profile_id=member_request_decision_test.id(10)) then raise exception 'Synthetic channel failure' using errcode='23514';end if;return new;end$$;
create trigger member_request_decision_test_channel before insert on public.message_channel_members for each row execute function member_request_decision_test.fail_channel();
set role authenticated;
select member_request_decision_test.denied(member_request_decision_test.request(230,member_request_decision_test.id(106)),'23514');
reset role;
do $$begin assert not exists(select 1 from public.team_members where team_id=member_request_decision_test.team() and profile_id=member_request_decision_test.id(10)) and (select status='pending' from public.join_requests where id=member_request_decision_test.id(106)) and not exists(select 1 from private.mobile_member_request_decision_receipts where request_nonce=member_request_decision_test.id(230)),'Late failure left partial membership/review/receipt';end$$;
drop trigger member_request_decision_test_channel on public.message_channel_members;
set role authenticated;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(4)::text,false);
select member_request_decision_test.capture('admin-role-approved',member_request_decision_test.request(231,member_request_decision_test.id(107)));
reset role;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(1)::text,false);
-- Actor loses role-assignment authority but retains both delegated permissions.
select public.set_team_permission_override(member_request_decision_test.team(),null,member_request_decision_test.id(11),'members.manage',true);
update public.team_members set role='member' where id=member_request_decision_test.id(11);
set role authenticated;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(4)::text,false);
select member_request_decision_test.denied((select request from member_request_decision_test.cases where name='admin-role-approved'),'42501');
reset role;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(1)::text,false);
select public.set_team_permission_override(member_request_decision_test.team(),null,member_request_decision_test.id(10),'members.manage',false);
set role authenticated;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(3)::text,false);
select member_request_decision_test.denied((select request from member_request_decision_test.cases where name='delegated-member-approved'),'42501');
reset role;
select set_config('request.jwt.claim.sub',member_request_decision_test.id(1)::text,false);
-- Deleting accepted state never turns a historical replay into a new membership write.
delete from public.team_members where team_id=member_request_decision_test.team() and profile_id=member_request_decision_test.id(7);
delete from public.join_requests where id=member_request_decision_test.id(100);
set role authenticated;
do $$declare req jsonb;denied boolean:=false;begin
 select request into req from member_request_decision_test.cases where name='new-approved';assert member_request_decision_test.rpc(req)=(select receipt from member_request_decision_test.cases where name='new-approved'),'Historical receipt changed';
 assert not exists(select 1 from public.team_members where team_id=member_request_decision_test.team() and profile_id=member_request_decision_test.id(7)),'Historical retry revived membership';
 begin perform 1 from private.mobile_member_request_decision_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private decision ledger directly readable';
end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_member_request_decision_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Immutable decision receipt edited';end$$;
select 'PASS atomic join-request approval/rejection, preserved channel effects, CAS, blocked memberships, delegated/current authority and rollback' as result;
