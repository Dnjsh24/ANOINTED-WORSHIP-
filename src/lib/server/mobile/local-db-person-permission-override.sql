\set ON_ERROR_STOP on
set timezone='UTC';
create schema person_permission_override_test;
create function person_permission_override_test.id(n integer) returns uuid language sql immutable as $$select ('99850000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table person_permission_override_test.ids(key text primary key,id uuid not null);
create table person_permission_override_test.cases(name text primary key,identity jsonb not null,request jsonb not null,receipt jsonb not null);
create table person_permission_override_test.states(name text primary key,identity jsonb not null,state jsonb not null);
grant usage on schema person_permission_override_test to authenticated;
grant select,insert on person_permission_override_test.ids,person_permission_override_test.cases,person_permission_override_test.states to authenticated;
insert into auth.users(id,email) select person_permission_override_test.id(n),'person-override-'||n||'@example.test' from generate_series(1,7) n;
select set_config('request.jwt.claim.sub',person_permission_override_test.id(1)::text,false);
insert into person_permission_override_test.ids select 'team',team_id from public.create_team_workspace('Role overrides A','POA-71023');
select set_config('request.jwt.claim.sub',person_permission_override_test.id(2)::text,false);
insert into person_permission_override_test.ids select 'other',team_id from public.create_team_workspace('Role overrides B','POB-71023');
create function person_permission_override_test.team() returns uuid language sql stable as $$select id from person_permission_override_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',person_permission_override_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status) values
 (person_permission_override_test.id(10),person_permission_override_test.team(),person_permission_override_test.id(3),'admin','active'),
 (person_permission_override_test.id(11),person_permission_override_test.team(),person_permission_override_test.id(4),'owner','active'),
 (person_permission_override_test.id(12),person_permission_override_test.team(),person_permission_override_test.id(5),'member','active'),
 (person_permission_override_test.id(13),person_permission_override_test.team(),person_permission_override_test.id(6),'member','active'),
 (person_permission_override_test.id(15),person_permission_override_test.team(),person_permission_override_test.id(7),'member','active');
select public.set_team_permission_override(person_permission_override_test.team(),null,person_permission_override_test.id(10),'team.manage',true);
select public.set_team_permission_override(person_permission_override_test.team(),null,person_permission_override_test.id(12),'team.manage',true);
select public.set_team_permission_override(person_permission_override_test.team(),null,person_permission_override_test.id(12),'events.manage',false);
select public.set_team_permission_override(person_permission_override_test.team(),null,person_permission_override_test.id(13),'events.manage',true);
select public.set_team_permission_override(person_permission_override_test.team(),'admin',null,'members.manage',true);
update public.team_permission_overrides set created_at='2026-10-23T03:04:05.123456Z' where team_id=person_permission_override_test.team() and role='admin' and permission='members.manage';
create table person_permission_override_test.people_before as select jsonb_agg(to_jsonb(o) order by id) value from public.team_permission_overrides o where member_id is not null;
create function person_permission_override_test.identity() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',auth.uid(),'teamId',m.team_id,'memberId',m.id,'teamName',t.name,'role',m.role,'permissions',jsonb_build_array('team.manage'))
 from public.team_members m join public.teams t on t.id=m.team_id where m.team_id=person_permission_override_test.team() and m.profile_id=auth.uid() and m.status='active'
$$;
create function person_permission_override_test.member(n integer) returns jsonb language sql stable security definer set search_path='' as $$select private.mobile_member_role_snapshot(m) from public.team_members m where id=person_permission_override_test.id(n)$$;
create function person_permission_override_test.base(n integer,permission_name text) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('member',person_permission_override_test.member(n),'override',(select private.mobile_person_permission_row(o) from public.team_permission_overrides o where team_id=person_permission_override_test.team() and member_id=person_permission_override_test.id(n) and role is null and permission=permission_name))$$;
create function person_permission_override_test.request(n integer,target integer,permission_name text,value text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',person_permission_override_test.team(),'memberId',person_permission_override_test.identity()->'memberId','requestNonce',person_permission_override_test.id(n),'permission',permission_name,'base',person_permission_override_test.base(target,permission_name),'value',value)
$$;
create function person_permission_override_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_person_permission_override((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function person_permission_override_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=person_permission_override_test.rpc(request);insert into person_permission_override_test.cases values(label,person_permission_override_test.identity(),request,result);return result;end$$;
create function person_permission_override_test.capture_state(label text,target integer,permission_name text) returns jsonb language plpgsql as $$declare result jsonb;begin result:=public.mobile_read_person_permission_override_state(person_permission_override_test.team(),(person_permission_override_test.identity()->>'memberId')::uuid,person_permission_override_test.id(target),permission_name);insert into person_permission_override_test.states values(label,person_permission_override_test.identity(),result);return result;end$$;
create function person_permission_override_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform person_permission_override_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected person override denial '||expected;end$$;

insert into auth.users(id,email) select person_permission_override_test.id(n),'person-more-'||n||'@example.test' from generate_series(8,12) n;
insert into public.team_members(id,team_id,profile_id,role,status,created_at) values
 (person_permission_override_test.id(20),person_permission_override_test.team(),person_permission_override_test.id(8),'member','active','2026-10-23T03:04:05.123456Z'),
 (person_permission_override_test.id(21),person_permission_override_test.team(),person_permission_override_test.id(9),'member','inactive','2026-10-23T03:04:05Z'),
 (person_permission_override_test.id(22),person_permission_override_test.team(),person_permission_override_test.id(10),'member','active','2026-10-23T03:04:05Z'),
 (person_permission_override_test.id(23),person_permission_override_test.team(),person_permission_override_test.id(11),'member','active','2026-10-23T03:04:05Z'),
 (person_permission_override_test.id(24),person_permission_override_test.team(),person_permission_override_test.id(12),'member','active','2026-10-23T03:04:05Z');
select public.set_team_permission_override(person_permission_override_test.team(),null,person_permission_override_test.id(20),'events.manage',true);
update public.team_permission_overrides set created_at='2026-10-23T03:04:05.123456Z' where member_id=person_permission_override_test.id(20) and permission='events.manage';
create table person_permission_override_test.roles_before as select jsonb_agg(to_jsonb(o) order by id) value from public.team_permission_overrides o where role is not null;
set role authenticated;
select person_permission_override_test.capture_state('precise-existing',20,'events.manage');
select person_permission_override_test.capture_state('missing-override',22,'files.upload');
select person_permission_override_test.capture_state('inactive-readonly',21,'files.upload');
select person_permission_override_test.capture_state('missing-member',90,'events.manage');
do $$declare req jsonb;result jsonb;permission_name text;n integer:=300;begin
 req:=person_permission_override_test.request(200,20,'events.manage','deny');result:=person_permission_override_test.capture('owner-deny',req);
 assert result->>'status'='applied' and result#>'{current,override,allowed}'='false'::jsonb and result#>'{current,member}'=req#>'{base,member}','Exact person deny failed';
 assert person_permission_override_test.rpc(req)=result,'Exact retry changed receipt';
 perform person_permission_override_test.denied(jsonb_set(req,'{value}','"allow"'),'22023');
 perform person_permission_override_test.denied(req||'{"targetRole":"admin"}','22023');
 perform person_permission_override_test.denied(jsonb_set(req,'{permission}','"messages.send"'),'22023');
 perform person_permission_override_test.denied(jsonb_set(req,'{userId}',to_jsonb(person_permission_override_test.id(2))),'42501');
 result:=person_permission_override_test.capture('role-conflict',jsonb_set(person_permission_override_test.request(201,20,'events.manage','allow'),'{base,member,role}','"admin"'));assert result->>'status'='conflict','Changed role ignored';
 result:=person_permission_override_test.capture('profile-conflict',jsonb_set(person_permission_override_test.request(202,20,'events.manage','allow'),'{base,member,profileId}',to_jsonb(person_permission_override_test.id(2))));assert result->>'status'='conflict','Changed profile ignored';
 result:=person_permission_override_test.capture('member-time-conflict',jsonb_set(person_permission_override_test.request(203,20,'events.manage','allow'),'{base,member,createdAt}','"2026-10-23T03:04:05.123457Z"'));assert result->>'status'='conflict','Changed member timestamp ignored';
 result:=person_permission_override_test.capture('custom-role-conflict',jsonb_set(person_permission_override_test.request(204,20,'events.manage','allow'),'{base,member,customRoleId}',to_jsonb(person_permission_override_test.id(90))));assert result->>'status'='conflict','Changed custom role ignored';
 result:=person_permission_override_test.capture('override-id-conflict',jsonb_set(person_permission_override_test.request(205,20,'events.manage','allow'),'{base,override,id}',to_jsonb(person_permission_override_test.id(90))));assert result->>'status'='conflict','Changed override ID ignored';
 result:=person_permission_override_test.capture('override-time-conflict',jsonb_set(person_permission_override_test.request(206,20,'events.manage','allow'),'{base,override,createdAt}','"2026-10-23T03:04:05.123457Z"'));assert result->>'status'='conflict','Changed override timestamp ignored';
 result:=person_permission_override_test.capture('override-value-conflict',jsonb_set(person_permission_override_test.request(207,20,'events.manage','allow'),'{base,override,allowed}','true'));assert result->>'status'='conflict','Changed override value ignored';
 result:=person_permission_override_test.capture('override-null-conflict',jsonb_set(person_permission_override_test.request(208,20,'events.manage','allow'),'{base,override}','null'));assert result->>'status'='conflict','Missing override overwrote existing row';
 result:=person_permission_override_test.capture('promoted-owner-conflict',jsonb_set(person_permission_override_test.request(211,11,'events.manage','allow'),'{base,member,role}','"member"'));assert result->>'status'='conflict' and result#>>'{current,member,role}'='owner','Promoted owner mutated';
 perform person_permission_override_test.denied(person_permission_override_test.request(209,21,'events.manage','allow'),'22023');
 perform person_permission_override_test.denied(person_permission_override_test.request(210,11,'events.manage','allow'),'42501');
 perform person_permission_override_test.denied(jsonb_set(req,'{base,member,id}',person_permission_override_test.identity()->'memberId'),'42501');
 foreach permission_name in array array['setlists.manage','songs.create','songs.edit','files.upload','members.manage','events.manage','team.manage'] loop
  result:=person_permission_override_test.capture('permission-'||permission_name,person_permission_override_test.request(n,22,permission_name,'allow'));assert result->>'status'='applied','Editable permission rejected';n:=n+1;
 end loop;
 result:=person_permission_override_test.capture('inherit',person_permission_override_test.request(310,22,'files.upload','inherit'));assert result#>'{current,override}'='null'::jsonb,'Inherit did not clear person override';
 result:=person_permission_override_test.capture('noop-inherit',person_permission_override_test.request(311,22,'files.upload','inherit'));assert result->>'status'='applied','No-op inherit not durable';
end$$;
reset role;
do $$begin assert (select value from person_permission_override_test.roles_before)=(select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o where role is not null),'Person write changed role rows';end$$;
-- Real database precedence: person deny beats role allow; person allow beats role deny.
select public.set_team_permission_override(person_permission_override_test.team(),'member',null,'events.manage',true);
select set_config('request.jwt.claim.sub',person_permission_override_test.id(8)::text,false);
do $$begin assert not private.has_team_permission(person_permission_override_test.team(),'events.manage'),'Role allow beat person deny';end$$;
select set_config('request.jwt.claim.sub',person_permission_override_test.id(1)::text,false);
select public.set_team_permission_override(person_permission_override_test.team(),'member',null,'events.manage',false);
set role authenticated;
select person_permission_override_test.capture('precedence-person-allow',person_permission_override_test.request(320,20,'events.manage','allow'));
reset role;
select set_config('request.jwt.claim.sub',person_permission_override_test.id(8)::text,false);
do $$begin assert private.has_team_permission(person_permission_override_test.team(),'events.manage'),'Role deny beat person allow';end$$;
select set_config('request.jwt.claim.sub',person_permission_override_test.id(1)::text,false);
create table person_permission_override_test.pending as select key,request from (
 values ('inactive',person_permission_override_test.request(400,23,'files.upload','allow')),
 ('missing',person_permission_override_test.request(401,24,'files.upload','allow')),
 ('website',person_permission_override_test.request(402,20,'events.manage','deny'))
) a(key,request);
grant select on person_permission_override_test.pending to authenticated;
update public.team_members set status='inactive' where id=person_permission_override_test.id(23);
delete from public.team_members where id=person_permission_override_test.id(24);
select public.set_team_permission_override(person_permission_override_test.team(),null,person_permission_override_test.id(20),'events.manage',null);
set role authenticated;
do $$declare result jsonb;begin
 result:=person_permission_override_test.capture('became-inactive',(select request from person_permission_override_test.pending where key='inactive'));assert result->>'status'='conflict' and result#>>'{current,member,status}'='inactive','Inactive change not conflicted';
 result:=person_permission_override_test.capture('missing-member',(select request from person_permission_override_test.pending where key='missing'));assert result->>'status'='missing' and result->'current'='null'::jsonb,'Deleted member not missing';
 result:=person_permission_override_test.capture('removed-override-conflict',(select request from person_permission_override_test.pending where key='website'));assert result->>'status'='conflict' and result#>'{current,override}'='null'::jsonb,'Removed override revived';
 perform person_permission_override_test.rpc((select request from person_permission_override_test.cases where name='owner-deny'));
end$$;
reset role;
do $$begin assert not exists(select 1 from public.team_permission_overrides where member_id=person_permission_override_test.id(20) and permission='events.manage'),'Historical retry revived override';end$$;
select public.set_team_permission_override(person_permission_override_test.team(),null,person_permission_override_test.id(20),'events.manage',true);
create table person_permission_override_test.replacement as select to_jsonb(o) value from public.team_permission_overrides o where member_id=person_permission_override_test.id(20) and permission='events.manage';
set role authenticated;
select person_permission_override_test.rpc((select request from person_permission_override_test.cases where name='owner-deny'));
reset role;
do $$begin assert (select value from person_permission_override_test.replacement)=(select to_jsonb(o) from public.team_permission_overrides o where member_id=person_permission_override_test.id(20) and permission='events.manage'),'Historical retry overwrote replacement';end$$;
delete from public.team_members where id=person_permission_override_test.id(20);
insert into public.team_members(id,team_id,profile_id,role,status) values(person_permission_override_test.id(20),person_permission_override_test.team(),person_permission_override_test.id(8),'media','active');
set role authenticated;
do $$declare result jsonb;begin result:=person_permission_override_test.capture('replaced-member-conflict',jsonb_set((select request from person_permission_override_test.cases where name='owner-deny'),'{requestNonce}',to_jsonb(person_permission_override_test.id(403))));assert result->>'status'='conflict','Fresh intent overwrote replacement membership';end$$;
do $$begin perform person_permission_override_test.rpc((select request from person_permission_override_test.cases where name='owner-deny'));assert not exists(select 1 from public.team_permission_overrides where member_id=person_permission_override_test.id(20)),'Retry granted replacement member';end$$;
reset role;
create function person_permission_override_test.fail_receipt() returns trigger language plpgsql as $$begin if new.request_nonce=person_permission_override_test.id(500) then raise exception 'Synthetic late failure' using errcode='23514';end if;return new;end$$;
create trigger person_permission_override_test_failure before insert on private.mobile_person_permission_override_receipts for each row execute function person_permission_override_test.fail_receipt();
create table person_permission_override_test.rollback_before as select (select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o) overrides,(select count(*) from public.activity_logs) logs;
set role authenticated;
select person_permission_override_test.denied(person_permission_override_test.request(500,22,'files.upload','deny'),'23514');
reset role;
do $$begin assert (select overrides from person_permission_override_test.rollback_before)=(select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o) and (select logs from person_permission_override_test.rollback_before)=(select count(*) from public.activity_logs),'Late ledger failure left override or audit';end$$;
drop trigger person_permission_override_test_failure on private.mobile_person_permission_override_receipts;
set role authenticated;
select person_permission_override_test.capture('rollback-exact-retry',person_permission_override_test.request(500,22,'files.upload','deny'));
select set_config('request.jwt.claim.sub',person_permission_override_test.id(3)::text,false);
select person_permission_override_test.denied(person_permission_override_test.request(510,22,'files.upload','deny'),'42501');
select set_config('request.jwt.claim.sub',person_permission_override_test.id(5)::text,false);
select person_permission_override_test.denied(person_permission_override_test.request(511,22,'files.upload','deny'),'42501');
select set_config('request.jwt.claim.sub',person_permission_override_test.id(4)::text,false);
select person_permission_override_test.denied(person_permission_override_test.request(512,22,'files.upload','deny'),'42501');
reset role;
select set_config('request.jwt.claim.sub',person_permission_override_test.id(1)::text,false);
select public.transfer_team_ownership(person_permission_override_test.team(),person_permission_override_test.id(11));
set role authenticated;
select person_permission_override_test.denied((select request from person_permission_override_test.cases where name='owner-deny'),'42501');
reset role;
select set_config('request.jwt.claim.sub',person_permission_override_test.id(4)::text,false);
select public.transfer_team_ownership(person_permission_override_test.team(),(select id from public.team_members where team_id=person_permission_override_test.team() and profile_id=person_permission_override_test.id(1)));
select set_config('request.jwt.claim.sub',person_permission_override_test.id(1)::text,false);
set role authenticated;
do $$declare denied boolean:=false;begin begin perform 1 from private.mobile_person_permission_override_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private ledger readable';end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_person_permission_override_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Ledger mutable';end$$;
set role anon;
do $$declare denied boolean:=false;begin begin perform public.mobile_apply_person_permission_override(null,null,'{}');exception when insufficient_privilege then denied:=true;end;assert denied,'Anonymous person override allowed';end$$;
reset role;
select 'PASS exact active-person permissions, role preservation, precedence, immutable retries and audit rollback' as result;
