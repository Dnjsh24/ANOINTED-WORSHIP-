\set ON_ERROR_STOP on
set timezone='UTC';
create schema role_permission_override_test;
create function role_permission_override_test.id(n integer) returns uuid language sql immutable as $$select ('99840000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table role_permission_override_test.ids(key text primary key,id uuid not null);
create table role_permission_override_test.cases(name text primary key,identity jsonb not null,request jsonb not null,receipt jsonb not null);
create table role_permission_override_test.states(name text primary key,identity jsonb not null,state jsonb not null);
grant usage on schema role_permission_override_test to authenticated;
grant select,insert on role_permission_override_test.ids,role_permission_override_test.cases,role_permission_override_test.states to authenticated;
insert into auth.users(id,email) select role_permission_override_test.id(n),'role-override-'||n||'@example.test' from generate_series(1,7) n;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(1)::text,false);
insert into role_permission_override_test.ids select 'team',team_id from public.create_team_workspace('Role overrides A','ROA-71023');
select set_config('request.jwt.claim.sub',role_permission_override_test.id(2)::text,false);
insert into role_permission_override_test.ids select 'other',team_id from public.create_team_workspace('Role overrides B','ROB-71023');
create function role_permission_override_test.team() returns uuid language sql stable as $$select id from role_permission_override_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status) values
 (role_permission_override_test.id(10),role_permission_override_test.team(),role_permission_override_test.id(3),'admin','active'),
 (role_permission_override_test.id(11),role_permission_override_test.team(),role_permission_override_test.id(4),'owner','active'),
 (role_permission_override_test.id(12),role_permission_override_test.team(),role_permission_override_test.id(5),'member','active'),
 (role_permission_override_test.id(13),role_permission_override_test.team(),role_permission_override_test.id(6),'member','active'),
 (role_permission_override_test.id(15),role_permission_override_test.team(),role_permission_override_test.id(7),'member','active');
select public.set_team_permission_override(role_permission_override_test.team(),null,role_permission_override_test.id(10),'team.manage',true);
select public.set_team_permission_override(role_permission_override_test.team(),null,role_permission_override_test.id(12),'team.manage',true);
select public.set_team_permission_override(role_permission_override_test.team(),null,role_permission_override_test.id(12),'events.manage',false);
select public.set_team_permission_override(role_permission_override_test.team(),null,role_permission_override_test.id(13),'events.manage',true);
select public.set_team_permission_override(role_permission_override_test.team(),'admin',null,'members.manage',true);
update public.team_permission_overrides set created_at='2026-10-23T03:04:05.123456Z' where team_id=role_permission_override_test.team() and role='admin' and permission='members.manage';
create table role_permission_override_test.people_before as select jsonb_agg(to_jsonb(o) order by id) value from public.team_permission_overrides o where member_id is not null;
create function role_permission_override_test.identity() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',auth.uid(),'teamId',m.team_id,'memberId',m.id,'teamName',t.name,'role',m.role,'permissions',jsonb_build_array('team.manage'))
 from public.team_members m join public.teams t on t.id=m.team_id where m.team_id=role_permission_override_test.team() and m.profile_id=auth.uid() and m.status='active'
$$;
create function role_permission_override_test.base(target_role text,permission_name text) returns jsonb language sql stable security definer set search_path='' as $$select private.mobile_role_permission_row(o) from public.team_permission_overrides o where team_id=role_permission_override_test.team() and role::text=target_role and member_id is null and permission=permission_name$$;
create function role_permission_override_test.request(n integer,target_role text,permission_name text,value text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',role_permission_override_test.team(),'memberId',role_permission_override_test.identity()->'memberId','requestNonce',role_permission_override_test.id(n),'targetRole',target_role,'permission',permission_name,'base',role_permission_override_test.base(target_role,permission_name),'value',value)
$$;
create function role_permission_override_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_role_permission_override((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function role_permission_override_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=role_permission_override_test.rpc(request);insert into role_permission_override_test.cases values(label,role_permission_override_test.identity(),request,result);return result;end$$;
create function role_permission_override_test.capture_state(label text,target_role text,permission_name text) returns jsonb language plpgsql as $$declare result jsonb;begin result:=public.mobile_read_role_permission_override_state(role_permission_override_test.team(),(role_permission_override_test.identity()->>'memberId')::uuid,target_role,permission_name);insert into role_permission_override_test.states values(label,role_permission_override_test.identity(),result);return result;end$$;
create function role_permission_override_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform role_permission_override_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected role override denial '||expected;end$$;
set role authenticated;
select role_permission_override_test.capture_state('precise-existing','admin','members.manage');
select role_permission_override_test.capture_state('missing-slot','member','events.manage');
do $$declare req jsonb;result jsonb;begin
 req:=role_permission_override_test.request(200,'admin','members.manage','deny');result:=role_permission_override_test.capture('owner-deny',req);
 assert result->>'status'='applied' and result#>'{current,allowed}'='false'::jsonb,'Owner deny not saved';
 assert role_permission_override_test.rpc(req)=result,'Exact retry changed result';
 perform role_permission_override_test.denied(jsonb_set(req,'{value}','"allow"'),'22023');
 perform role_permission_override_test.denied(req||'{"personId":"unexpected"}','22023');
 perform role_permission_override_test.denied(jsonb_set(req,'{targetRole}','"owner"'),'22023');
 perform role_permission_override_test.denied(jsonb_set(req,'{permission}','"messages.send"'),'22023');
 perform role_permission_override_test.denied(jsonb_set(req,'{userId}',to_jsonb(role_permission_override_test.id(2))),'42501');
 result:=role_permission_override_test.capture('expected-missing-conflict',jsonb_set(role_permission_override_test.request(201,'admin','members.manage','allow'),'{base}','null'));assert result->>'status'='conflict','Missing base overwrote row';
 result:=role_permission_override_test.capture('id-conflict',jsonb_set(role_permission_override_test.request(202,'admin','members.manage','allow'),'{base,id}',to_jsonb(role_permission_override_test.id(90))));assert result->>'status'='conflict','Changed row ID ignored';
 result:=role_permission_override_test.capture('allowed-conflict',jsonb_set(role_permission_override_test.request(203,'admin','members.manage','allow'),'{base,allowed}','true'));assert result->>'status'='conflict','Changed allowed value ignored';
 result:=role_permission_override_test.capture('time-conflict',jsonb_set(role_permission_override_test.request(204,'admin','members.manage','allow'),'{base,createdAt}','"2026-10-23T03:04:05.123457Z"'));assert result->>'status'='conflict','Changed timestamp ignored';
 result:=role_permission_override_test.capture('member-events-allow',role_permission_override_test.request(205,'member','events.manage','allow'));assert result#>'{current,allowed}'='true'::jsonb,'Role allow failed';
end$$;
reset role;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(5)::text,false);
do $$begin assert not private.has_team_permission(role_permission_override_test.team(),'events.manage'),'Person deny lost precedence';end$$;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(6)::text,false);
do $$begin assert private.has_team_permission(role_permission_override_test.team(),'events.manage'),'Person allow lost precedence';end$$;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(7)::text,false);
do $$begin assert private.has_team_permission(role_permission_override_test.team(),'events.manage'),'Role grant did not reach unoverridden member';end$$;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(1)::text,false);
set role authenticated;
select role_permission_override_test.capture('member-events-deny',role_permission_override_test.request(206,'member','events.manage','deny'));
reset role;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(6)::text,false);
do $$begin assert private.has_team_permission(role_permission_override_test.team(),'events.manage'),'Role deny overrode person allow';end$$;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(7)::text,false);
do $$begin assert not private.has_team_permission(role_permission_override_test.team(),'events.manage'),'Role deny did not revoke unoverridden member';end$$;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(1)::text,false);
set role authenticated;
select role_permission_override_test.capture('member-events-inherit',role_permission_override_test.request(207,'member','events.manage','inherit'));
select role_permission_override_test.capture('noop-inherit',role_permission_override_test.request(208,'member','events.manage','inherit'));
do $$declare role_name text;permission_name text;n integer:=300;result jsonb;begin
 foreach role_name in array array['admin','pastor','worship_leader','band_leader','band_member','dancer','media','member'] loop
  result:=role_permission_override_test.capture('role-'||role_name,role_permission_override_test.request(n,role_name,'setlists.manage','allow'));assert result->>'status'='applied','Builtin role rejected';n:=n+1;
 end loop;
 foreach permission_name in array array['setlists.manage','songs.create','songs.edit','files.upload','members.manage','events.manage','team.manage'] loop
  result:=role_permission_override_test.capture('permission-'||permission_name,role_permission_override_test.request(n,'member',permission_name,'inherit'));assert result->>'status'='applied','Editable permission rejected';n:=n+1;
 end loop;
end$$;
reset role;
do $$begin assert (select value from role_permission_override_test.people_before)=(select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o where member_id is not null),'Role write modified person overrides';end$$;
create table role_permission_override_test.lost as select role_permission_override_test.request(400,'admin','members.manage','deny') request;
grant select on role_permission_override_test.lost to authenticated;
select public.set_team_permission_override(role_permission_override_test.team(),'admin',null,'members.manage',null);
set role authenticated;
do $$declare result jsonb;begin result:=role_permission_override_test.capture('deleted-base-conflict',(select request from role_permission_override_test.lost));assert result->>'status'='conflict' and result->'current'='null'::jsonb,'Deleted base revived';perform role_permission_override_test.rpc((select request from role_permission_override_test.cases where name='owner-deny'));end$$;
reset role;
do $$begin assert not exists(select 1 from public.team_permission_overrides where team_id=role_permission_override_test.team() and role='admin' and permission='members.manage'),'Historical retry revived override';end$$;
select public.set_team_permission_override(role_permission_override_test.team(),'admin',null,'members.manage',true);
create table role_permission_override_test.replacement as select to_jsonb(o) value from public.team_permission_overrides o where team_id=role_permission_override_test.team() and role='admin' and permission='members.manage';
set role authenticated;
select role_permission_override_test.rpc((select request from role_permission_override_test.cases where name='owner-deny'));
reset role;
do $$begin assert (select value from role_permission_override_test.replacement)=(select to_jsonb(o) from public.team_permission_overrides o where team_id=role_permission_override_test.team() and role='admin' and permission='members.manage'),'Historical retry overwrote replacement';end$$;
create function role_permission_override_test.fail_receipt() returns trigger language plpgsql as $$begin if new.request_nonce=role_permission_override_test.id(500) then raise exception 'Synthetic late failure' using errcode='23514';end if;return new;end$$;
create trigger role_permission_override_test_failure before insert on private.mobile_role_permission_override_receipts for each row execute function role_permission_override_test.fail_receipt();
create table role_permission_override_test.rollback_before as select (select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o) overrides,(select count(*) from public.activity_logs) logs;
set role authenticated;
select role_permission_override_test.denied(role_permission_override_test.request(500,'media','files.upload','allow'),'23514');
reset role;
do $$begin assert (select overrides from role_permission_override_test.rollback_before)=(select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o) and (select logs from role_permission_override_test.rollback_before)=(select count(*) from public.activity_logs),'Late ledger failure left an override or audit entry';end$$;
drop trigger role_permission_override_test_failure on private.mobile_role_permission_override_receipts;
set role authenticated;
select role_permission_override_test.capture('rollback-exact-retry',role_permission_override_test.request(500,'media','files.upload','allow'));
select set_config('request.jwt.claim.sub',role_permission_override_test.id(3)::text,false);
select role_permission_override_test.denied(role_permission_override_test.request(510,'admin','members.manage','deny'),'42501');
select set_config('request.jwt.claim.sub',role_permission_override_test.id(5)::text,false);
select role_permission_override_test.denied(role_permission_override_test.request(511,'admin','members.manage','deny'),'42501');
select set_config('request.jwt.claim.sub',role_permission_override_test.id(4)::text,false);
select role_permission_override_test.denied(role_permission_override_test.request(512,'admin','members.manage','deny'),'42501');
do $$declare denied boolean:=false;begin begin perform public.mobile_read_role_permission_override_state(role_permission_override_test.team(),role_permission_override_test.id(11),'admin','members.manage');exception when insufficient_privilege then denied:=true;end;assert denied,'Secondary owner read canonical-owner state';end$$;
reset role;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(1)::text,false);
insert into role_permission_override_test.ids select 'old-owner-member',(role_permission_override_test.identity()->>'memberId')::uuid;
select public.transfer_team_ownership(role_permission_override_test.team(),role_permission_override_test.id(11));
set role authenticated;
select role_permission_override_test.denied((select request from role_permission_override_test.cases where name='owner-deny'),'42501');
reset role;
select set_config('request.jwt.claim.sub',role_permission_override_test.id(4)::text,false);
delete from public.team_members where id=(select id from role_permission_override_test.ids where key='old-owner-member');
insert into public.team_members(id,team_id,profile_id,role,status) values(role_permission_override_test.id(14),role_permission_override_test.team(),role_permission_override_test.id(1),'member','active');
select public.transfer_team_ownership(role_permission_override_test.team(),role_permission_override_test.id(14));
select set_config('request.jwt.claim.sub',role_permission_override_test.id(1)::text,false);
set role authenticated;
select role_permission_override_test.denied((select request from role_permission_override_test.cases where name='owner-deny'),'42501');
select role_permission_override_test.capture_state('fresh-replaced-owner','admin','members.manage');
do $$declare denied boolean:=false;begin begin perform 1 from private.mobile_role_permission_override_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private ledger readable';end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_role_permission_override_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Ledger mutable';end$$;
set role anon;
do $$declare denied boolean:=false;begin begin perform public.mobile_apply_role_permission_override(null,null,'{}');exception when insufficient_privilege then denied:=true;end;assert denied,'Anonymous override allowed';end$$;
reset role;
select 'PASS canonical-owner role overrides, exact CAS, person precedence, replay non-revival and atomic audit rollback' as result;
