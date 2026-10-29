\set ON_ERROR_STOP on
set timezone='UTC';
-- Synthetic disposable loopback fixtures only.
create schema member_role_assignment_test;
create function member_role_assignment_test.id(n integer) returns uuid language sql immutable as $$select ('99810000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table member_role_assignment_test.ids(key text primary key,id uuid not null);
create table member_role_assignment_test.cases(name text primary key,identity jsonb not null,request jsonb not null,receipt jsonb not null);
create table member_role_assignment_test.states(name text primary key,identity jsonb not null,state jsonb not null);
grant usage on schema member_role_assignment_test to authenticated;
grant select,insert on member_role_assignment_test.ids,member_role_assignment_test.cases,member_role_assignment_test.states to authenticated;
insert into auth.users(id,email) select member_role_assignment_test.id(n),'assignment-'||n||'@example.test' from generate_series(1,14) n;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
insert into member_role_assignment_test.ids select 'team',team_id from public.create_team_workspace('Assignments A','MRA-71023');
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(2)::text,false);
insert into member_role_assignment_test.ids select 'other',team_id from public.create_team_workspace('Assignments B','MRB-71023');
create function member_role_assignment_test.team() returns uuid language sql stable as $$select id from member_role_assignment_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status,ministry,created_at) values
 (member_role_assignment_test.id(10),member_role_assignment_test.team(),member_role_assignment_test.id(3),'admin','active','Admin','2026-10-23T02:00:00Z'),
 (member_role_assignment_test.id(11),member_role_assignment_test.team(),member_role_assignment_test.id(4),'owner','active','Owner','2026-10-23T02:00:00Z'),
 (member_role_assignment_test.id(12),member_role_assignment_test.team(),member_role_assignment_test.id(5),'member','active','Delegate','2026-10-23T02:00:00Z'),
 (member_role_assignment_test.id(20),member_role_assignment_test.team(),member_role_assignment_test.id(6),'member','active','Precise','2026-10-23T03:04:05.123456Z'),
 (member_role_assignment_test.id(21),member_role_assignment_test.team(),member_role_assignment_test.id(7),'member','inactive','Inactive','2026-10-23T03:00:00Z'),
 (member_role_assignment_test.id(22),member_role_assignment_test.team(),member_role_assignment_test.id(8),'member','active','CAS','2026-10-23T03:00:00Z'),
 (member_role_assignment_test.id(23),member_role_assignment_test.team(),member_role_assignment_test.id(9),'member','active','Replay','2026-10-23T03:00:00Z'),
 (member_role_assignment_test.id(24),member_role_assignment_test.team(),member_role_assignment_test.id(10),'member','active','Rollback','2026-10-23T03:00:00Z'),
 (member_role_assignment_test.id(25),member_role_assignment_test.team(),member_role_assignment_test.id(11),'member','active','Website race','2026-10-23T03:00:00Z'),
 (member_role_assignment_test.id(26),member_role_assignment_test.team(),member_role_assignment_test.id(12),'member','active','Custom edit race','2026-10-23T03:00:00Z'),
 (member_role_assignment_test.id(27),member_role_assignment_test.team(),member_role_assignment_test.id(13),'member','active','Target delete race','2026-10-23T03:00:00Z'),
 (member_role_assignment_test.id(28),member_role_assignment_test.team(),member_role_assignment_test.id(14),'member','active','Custom delete race','2026-10-23T03:00:00Z');
insert into public.custom_roles(id,team_id,name,permissions,created_at) values
 (member_role_assignment_test.id(30),member_role_assignment_test.team(),'',array['team.manage','events.manage'],'2026-10-23T03:04:05.123456Z'),
 (member_role_assignment_test.id(31),member_role_assignment_test.team(),'Missing role',array[]::text[],null),
 (member_role_assignment_test.id(32),member_role_assignment_test.team(),'Changed role',array['songs.create'],null),
 (member_role_assignment_test.id(33),member_role_assignment_test.team(),'Race edit role',array['events.manage'],null),
 (member_role_assignment_test.id(34),member_role_assignment_test.team(),'Race delete role',array['events.manage'],null);
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(2)::text,false);
insert into public.custom_roles(id,team_id,name,permissions) values(member_role_assignment_test.id(35),(select id from member_role_assignment_test.ids where key='other'),'Foreign role',array[]::text[]);
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
select public.set_team_permission_override(member_role_assignment_test.team(),null,member_role_assignment_test.id(20),'songs.edit',false);
select public.set_team_permission_override(member_role_assignment_test.team(),null,member_role_assignment_test.id(12),'members.manage',true);
create table member_role_assignment_test.overrides_before as select jsonb_agg(to_jsonb(o) order by id) value from public.team_permission_overrides o;
create function member_role_assignment_test.identity() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',auth.uid(),'teamId',m.team_id,'memberId',m.id,'teamName',t.name,'role',m.role,'permissions',jsonb_build_array('members.manage'))
 from public.team_members m join public.teams t on t.id=m.team_id where m.team_id=member_role_assignment_test.team() and m.profile_id=auth.uid() and m.status='active'
$$;
create function member_role_assignment_test.base(n integer) returns jsonb language sql stable security definer set search_path='' as $$select private.mobile_member_role_snapshot(m) from public.team_members m where id=member_role_assignment_test.id(n)$$;
create function member_role_assignment_test.custom(n integer) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('id',id,'teamId',team_id,'name',name,'permissions',permissions,'createdAt',created_at) from public.custom_roles where id=member_role_assignment_test.id(n)$$;
create function member_role_assignment_test.request(n integer,target integer,role text,custom_role jsonb default 'null') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',member_role_assignment_test.team(),'memberId',(select id from public.team_members where team_id=member_role_assignment_test.team() and profile_id=auth.uid() and status='active'),'requestNonce',member_role_assignment_test.id(n),'base',member_role_assignment_test.base(target),'value',jsonb_build_object('role',role,'customRole',custom_role))
$$;
create function member_role_assignment_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_member_role_assignment((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function member_role_assignment_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=member_role_assignment_test.rpc(request);insert into member_role_assignment_test.cases values(label,member_role_assignment_test.identity(),request,result);return result;end$$;
create function member_role_assignment_test.capture_state(label text,target uuid) returns jsonb language plpgsql as $$declare result jsonb;begin result:=public.mobile_read_member_role_state(member_role_assignment_test.team(),(member_role_assignment_test.identity()->>'memberId')::uuid,target);insert into member_role_assignment_test.states values(label,member_role_assignment_test.identity(),result);return result;end$$;
create function member_role_assignment_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform member_role_assignment_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected assignment denial '||expected;end$$;
set role authenticated;
select member_role_assignment_test.capture_state('precise-target',member_role_assignment_test.id(20));
select member_role_assignment_test.capture_state('inactive-target',member_role_assignment_test.id(21));
select member_role_assignment_test.capture_state('owner-self',(member_role_assignment_test.identity()->>'memberId')::uuid);
select member_role_assignment_test.capture_state('missing-target',member_role_assignment_test.id(90));
do $$declare req jsonb;result jsonb;role_name text;n integer:=200;begin
 foreach role_name in array array['admin','pastor','worship_leader','band_leader','band_member','dancer','media','member'] loop
  req:=member_role_assignment_test.request(n,20,role_name);result:=member_role_assignment_test.capture('builtin-'||role_name,req);
  assert result->>'status'='applied' and result#>>'{current,role}'=role_name and result#>'{current,createdAt}'=req#>'{base,createdAt}','Builtin role not applied exactly';
  assert member_role_assignment_test.rpc(req)=result,'Exact builtin retry changed receipt';n:=n+1;
 end loop;
 req:=member_role_assignment_test.request(210,20,'member',member_role_assignment_test.custom(30));result:=member_role_assignment_test.capture('custom-assigned',req);
 assert result->>'status'='applied' and result#>>'{current,customRoleId}'=member_role_assignment_test.id(30)::text,'Exact custom role not assigned';
 perform member_role_assignment_test.denied(jsonb_set(req,'{value,role}','"media"'),'22023');
 result:=member_role_assignment_test.capture('custom-removed',member_role_assignment_test.request(211,20,'media'));assert result#>'{current,customRoleId}'='null'::jsonb,'Custom role not removed';
 result:=member_role_assignment_test.capture('inactive-target-applied',member_role_assignment_test.request(212,21,'dancer'));assert result->>'status'='applied' and result#>>'{current,status}'='inactive','Inactive target status changed';
 req:=member_role_assignment_test.request(220,22,'band_member');
 result:=member_role_assignment_test.capture('role-conflict',jsonb_set(req,'{base,role}','"pastor"'));assert result->>'status'='conflict','Changed role overwritten';
 result:=member_role_assignment_test.capture('status-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(member_role_assignment_test.id(221))),'{base,status}','"inactive"'));assert result->>'status'='conflict','Changed status overwritten';
 result:=member_role_assignment_test.capture('profile-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(member_role_assignment_test.id(222))),'{base,profileId}',to_jsonb(member_role_assignment_test.id(2))));assert result->>'status'='conflict','Changed profile overwritten';
 result:=member_role_assignment_test.capture('timestamp-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(member_role_assignment_test.id(223))),'{base,createdAt}','"2026-10-23T03:00:00.000001Z"'));assert result->>'status'='conflict','Changed timestamp overwritten';
 result:=member_role_assignment_test.capture('custom-id-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(member_role_assignment_test.id(224))),'{base,customRoleId}',to_jsonb(member_role_assignment_test.id(30))));assert result->>'status'='conflict','Changed custom role overwritten';
 result:=member_role_assignment_test.capture('missing-target',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(member_role_assignment_test.id(225))),'{base,id}',to_jsonb(member_role_assignment_test.id(90))));assert result->>'status'='missing','Missing target not reported';
 req:=member_role_assignment_test.request(226,22,'member',member_role_assignment_test.custom(32));
 result:=member_role_assignment_test.capture('custom-changed',jsonb_set(req,'{value,customRole,permissions}','["events.manage"]'));assert result->>'status'='blocked' and result->>'reason'='custom_role_changed' and result->'current'=req->'base','Changed custom role assigned';
 req:=member_role_assignment_test.request(227,22,'member',member_role_assignment_test.custom(30));
 result:=member_role_assignment_test.capture('custom-order-changed',jsonb_set(req,'{value,customRole,permissions}','["events.manage","team.manage"]'));assert result->>'status'='blocked' and result->>'reason'='custom_role_changed','Custom permission order ignored';
 perform member_role_assignment_test.denied(jsonb_set(req,'{userId}',to_jsonb(member_role_assignment_test.id(2))),'42501');
 perform member_role_assignment_test.denied(jsonb_set(req,'{memberId}',to_jsonb(member_role_assignment_test.id(10))),'42501');
 perform member_role_assignment_test.denied(jsonb_set(req,'{base,teamId}',to_jsonb(member_role_assignment_test.id(90))),'42501');
 perform member_role_assignment_test.denied(req||'{"unexpected":true}','22023');
 perform member_role_assignment_test.denied(member_role_assignment_test.request(230,11,'member'),'42501');
 perform member_role_assignment_test.denied(jsonb_set(member_role_assignment_test.request(231,11,'member'),'{base,role}','"member"'),'42501');
 perform member_role_assignment_test.denied(jsonb_set(req,'{base,id}',member_role_assignment_test.identity()->'memberId'),'42501');
 perform member_role_assignment_test.denied(jsonb_set(req,'{base,profileId}',member_role_assignment_test.identity()->'userId'),'42501');
 perform member_role_assignment_test.denied(member_role_assignment_test.request(232,22,'owner'),'22023');
 perform member_role_assignment_test.denied(member_role_assignment_test.request(233,22,'admin',member_role_assignment_test.custom(30)),'22023');
 perform member_role_assignment_test.denied(member_role_assignment_test.request(234,22,'member',member_role_assignment_test.custom(35)),'42501');
 perform member_role_assignment_test.denied(member_role_assignment_test.request(235,22,'member',jsonb_set(member_role_assignment_test.custom(35),'{teamId}',to_jsonb(member_role_assignment_test.team()))),'42501');
end$$;
reset role;
do $$begin assert (select value from member_role_assignment_test.overrides_before)=(select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o),'Assignment changed permission overrides';assert exists(select 1 from public.team_members where id=member_role_assignment_test.id(20) and ministry='Precise' and status='active' and created_at='2026-10-23T03:04:05.123456Z'),'Assignment changed unrelated member data';end$$;
create table member_role_assignment_test.missing_custom_request as select member_role_assignment_test.request(240,22,'member',member_role_assignment_test.custom(31)) request;
grant select on member_role_assignment_test.missing_custom_request to authenticated;
delete from public.custom_roles where id=member_role_assignment_test.id(31);
set role authenticated;
do $$declare result jsonb;begin result:=member_role_assignment_test.capture('custom-missing',(select request from member_role_assignment_test.missing_custom_request));assert result->>'status'='blocked' and result->>'reason'='custom_role_missing','Deleted custom role assigned';end$$;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(5)::text,false);
select member_role_assignment_test.denied(member_role_assignment_test.request(241,22,'pastor'),'42501');
reset role;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
create function member_role_assignment_test.fail_receipt() returns trigger language plpgsql as $$begin if new.request_nonce=member_role_assignment_test.id(500) then raise exception 'Synthetic late failure' using errcode='23514';end if;return new;end$$;
create trigger member_role_assignment_test_failure before insert on private.mobile_member_role_assignment_receipts for each row execute function member_role_assignment_test.fail_receipt();
create table member_role_assignment_test.rollback_before as select to_jsonb(m) value from public.team_members m where id=member_role_assignment_test.id(24);
set role authenticated;
select member_role_assignment_test.denied(member_role_assignment_test.request(500,24,'band_leader'),'23514');
reset role;
do $$begin assert (select value from member_role_assignment_test.rollback_before)=(select to_jsonb(m) from public.team_members m where id=member_role_assignment_test.id(24)) and not exists(select 1 from private.mobile_member_role_assignment_receipts where request_nonce=member_role_assignment_test.id(500)),'Late ledger failure left a membership update';end$$;
drop trigger member_role_assignment_test_failure on private.mobile_member_role_assignment_receipts;
set role authenticated;
select member_role_assignment_test.capture('rollback-exact-retry',member_role_assignment_test.request(500,24,'band_leader'));
select member_role_assignment_test.capture('before-target-delete',member_role_assignment_test.request(510,23,'band_member'));
reset role;
delete from public.team_members where id=member_role_assignment_test.id(23);
set role authenticated;
do $$begin assert member_role_assignment_test.rpc((select request from member_role_assignment_test.cases where name='before-target-delete'))=(select receipt from member_role_assignment_test.cases where name='before-target-delete'),'Deleted-target replay changed';end$$;
reset role;
do $$begin assert not exists(select 1 from public.team_members where id=member_role_assignment_test.id(23)),'Replay revived deleted target';end$$;
insert into public.team_members(id,team_id,profile_id,role,status,ministry) values(member_role_assignment_test.id(23),member_role_assignment_test.team(),member_role_assignment_test.id(9),'media','inactive','Replacement');
set role authenticated;
do $$begin perform member_role_assignment_test.rpc((select request from member_role_assignment_test.cases where name='before-target-delete'));assert exists(select 1 from public.team_members where id=member_role_assignment_test.id(23) and role='media' and status='inactive' and ministry='Replacement'),'Replay overwrote replacement';end$$;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(3)::text,false);
select member_role_assignment_test.capture('admin-applied',member_role_assignment_test.request(520,22,'pastor'));
reset role;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
select public.set_team_permission_override(member_role_assignment_test.team(),null,member_role_assignment_test.id(10),'members.manage',false);
set role authenticated;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(3)::text,false);
select member_role_assignment_test.denied((select request from member_role_assignment_test.cases where name='admin-applied'),'42501');
do $$declare denied boolean:=false;begin begin perform public.mobile_read_member_role_state(member_role_assignment_test.team(),member_role_assignment_test.id(10),member_role_assignment_test.id(22));exception when insufficient_privilege then denied:=true;end;assert denied,'Denied admin read state';end$$;
reset role;
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(1)::text,false);
select public.set_team_permission_override(member_role_assignment_test.team(),null,member_role_assignment_test.id(10),'members.manage',true);
set role authenticated;
select member_role_assignment_test.capture('owner-demotes-admin',member_role_assignment_test.request(521,10,'member'));
select set_config('request.jwt.claim.sub',member_role_assignment_test.id(3)::text,false);
select member_role_assignment_test.denied((select request from member_role_assignment_test.cases where name='admin-applied'),'42501');
do $$declare denied boolean:=false;begin begin perform 1 from private.mobile_member_role_assignment_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private ledger readable';end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_member_role_assignment_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Ledger mutable';end$$;
set role anon;
do $$declare denied boolean:=false;begin begin perform public.mobile_apply_member_role_assignment(null,null,'{}');exception when insufficient_privilege then denied:=true;end;assert denied,'Anonymous assignment allowed';end$$;
reset role;
select 'PASS all non-owner roles, exact custom fingerprints, immutable receipts, owner/admin boundaries and late rollback' as result;
