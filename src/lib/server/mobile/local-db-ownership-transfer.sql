\set ON_ERROR_STOP on
set timezone='UTC';
create schema ownership_transfer_test;
create function ownership_transfer_test.id(n integer) returns uuid language sql immutable as $$select ('99870000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table ownership_transfer_test.ids(key text primary key,id uuid not null);
create table ownership_transfer_test.cases(name text primary key,identity jsonb not null,fresh_identity jsonb not null,request jsonb not null,receipt jsonb not null);
create table ownership_transfer_test.states(name text primary key,identity jsonb not null,state jsonb not null);
create table ownership_transfer_test.pending(key text primary key,request jsonb not null);
grant usage on schema ownership_transfer_test to authenticated;
grant select,insert on all tables in schema ownership_transfer_test to authenticated;
insert into auth.users(id,email) select ownership_transfer_test.id(n),'ownership-'||n||'@example.test' from generate_series(1,11) n;
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(1)::text,false);
insert into ownership_transfer_test.ids select 'team',team_id from public.create_team_workspace('Ownership A','OTA-71023');
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(2)::text,false);
insert into ownership_transfer_test.ids select 'other',team_id from public.create_team_workspace('Ownership B','OTB-71023');
create function ownership_transfer_test.team() returns uuid language sql stable as $$select id from ownership_transfer_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(1)::text,false);
insert into public.custom_roles(id,team_id,name,permissions) values(ownership_transfer_test.id(30),ownership_transfer_test.team(),'Target custom role',array['files.upload']);
insert into public.team_members(id,team_id,profile_id,role,status,custom_role_id,created_at,ministry) values
 (ownership_transfer_test.id(10),ownership_transfer_test.team(),ownership_transfer_test.id(3),'admin','active',null,'2026-10-23T03:00:00Z','Admin'),
 (ownership_transfer_test.id(11),ownership_transfer_test.team(),ownership_transfer_test.id(4),'owner','active',null,'2026-10-23T03:00:00Z','Secondary owner'),
 (ownership_transfer_test.id(12),ownership_transfer_test.team(),ownership_transfer_test.id(5),'member','active',null,'2026-10-23T03:00:00Z','Delegate'),
 (ownership_transfer_test.id(20),ownership_transfer_test.team(),ownership_transfer_test.id(6),'member','active',ownership_transfer_test.id(30),'2026-10-23T03:04:05.123456Z','Precise owner target'),
 (ownership_transfer_test.id(21),ownership_transfer_test.team(),ownership_transfer_test.id(7),'pastor','active',ownership_transfer_test.id(30),'2026-10-23T03:00:00Z','Rollback/edit target'),
 (ownership_transfer_test.id(22),ownership_transfer_test.team(),ownership_transfer_test.id(8),'member','active',null,'2026-10-23T03:00:00Z','Missing target'),
 (ownership_transfer_test.id(23),ownership_transfer_test.team(),ownership_transfer_test.id(9),'member','active',null,'2026-10-23T03:00:00Z','Second transfer'),
 (ownership_transfer_test.id(24),ownership_transfer_test.team(),ownership_transfer_test.id(10),'member','active',null,'2026-10-23T03:00:00Z','Deletion race'),
 (ownership_transfer_test.id(25),ownership_transfer_test.team(),ownership_transfer_test.id(11),'member','active',null,'2026-10-23T03:00:00Z','Old owner race');
select public.set_team_permission_override(ownership_transfer_test.team(),null,ownership_transfer_test.id(10),'team.manage',true);
select public.set_team_permission_override(ownership_transfer_test.team(),null,ownership_transfer_test.id(12),'team.manage',true);
select public.set_team_permission_override(ownership_transfer_test.team(),'admin',null,'team.manage',false);
select public.set_team_permission_override(ownership_transfer_test.team(),'admin',null,'members.manage',false);
select public.set_team_permission_override(ownership_transfer_test.team(),null,ownership_transfer_test.id(20),'songs.edit',false);
create table ownership_transfer_test.overrides_before as select jsonb_agg(to_jsonb(o) order by id) value from public.team_permission_overrides o;
create function ownership_transfer_test.actor() returns uuid language sql stable security definer set search_path='' as $$select id from public.team_members where team_id=ownership_transfer_test.team() and profile_id=auth.uid() and status='active'$$;
create function ownership_transfer_test.identity() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',auth.uid(),'teamId',m.team_id,'memberId',m.id,'teamName',t.name,'role',m.role,
 'permissions',(select coalesce(jsonb_agg(p order by p),'[]') from unnest(array['team.manage','members.manage','events.manage','songs.create','songs.edit','files.upload','setlists.manage']) p where private.has_team_permission(m.team_id,p)))
 from public.team_members m join public.teams t on t.id=m.team_id where m.id=ownership_transfer_test.actor()
$$;
create function ownership_transfer_test.request(n integer,target integer) returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',ownership_transfer_test.team(),'memberId',ownership_transfer_test.actor(),'requestNonce',ownership_transfer_test.id(n),
 'base',private.mobile_ownership_current(ownership_transfer_test.team(),ownership_transfer_test.actor(),ownership_transfer_test.id(target)))
$$;
create function ownership_transfer_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_ownership_transfer((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function ownership_transfer_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;prior_identity jsonb:=ownership_transfer_test.identity();begin result:=ownership_transfer_test.rpc(request);insert into ownership_transfer_test.cases values(label,prior_identity,ownership_transfer_test.identity(),request,result);return result;end$$;
create function ownership_transfer_test.capture_state(label text,target integer,nonce integer default null) returns jsonb language plpgsql as $$declare result jsonb;begin result:=public.mobile_read_ownership_transfer_state(ownership_transfer_test.team(),ownership_transfer_test.actor(),ownership_transfer_test.id(target),case when nonce is null then null else ownership_transfer_test.id(nonce) end);insert into ownership_transfer_test.states values(label,ownership_transfer_test.identity(),result);return result;end$$;
create function ownership_transfer_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform ownership_transfer_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected ownership denial '||expected;end$$;
create function ownership_transfer_test.denied_state(target integer,nonce integer,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform public.mobile_read_ownership_transfer_state(ownership_transfer_test.team(),ownership_transfer_test.actor(),ownership_transfer_test.id(target),case when nonce is null then null else ownership_transfer_test.id(nonce) end);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected ownership state denial '||expected;end$$;
create table ownership_transfer_test.all_before as select (select jsonb_agg(to_jsonb(m) order by id) from public.team_members m) members,(select to_jsonb(t) from public.teams t where id=ownership_transfer_test.team()) team;
set role authenticated;
select ownership_transfer_test.capture_state('fresh-owner',20);
do $$declare req jsonb;result jsonb;begin
 req:=ownership_transfer_test.request(500,20);
 result:=ownership_transfer_test.capture('profile-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(ownership_transfer_test.id(501))),'{base,target,profileId}',to_jsonb(ownership_transfer_test.id(2))));assert result->>'status'='conflict','Target profile ignored';
 result:=ownership_transfer_test.capture('role-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(ownership_transfer_test.id(502))),'{base,target,role}','"pastor"'));assert result->>'status'='conflict','Target role ignored';
 result:=ownership_transfer_test.capture('custom-role-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(ownership_transfer_test.id(503))),'{base,target,customRoleId}','null'));assert result->>'status'='conflict','Target custom role ignored';
 result:=ownership_transfer_test.capture('timestamp-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(ownership_transfer_test.id(504))),'{base,target,createdAt}','"2026-10-23T03:04:05.123457Z"'));assert result->>'status'='conflict','Target timestamp ignored';
 perform ownership_transfer_test.denied(jsonb_set(req,'{userId}',to_jsonb(ownership_transfer_test.id(2))),'42501');
 perform ownership_transfer_test.denied(jsonb_set(req,'{base,target,id}',to_jsonb(ownership_transfer_test.actor())),'22023');
 perform ownership_transfer_test.denied(jsonb_set(req,'{base,target,profileId}',to_jsonb(auth.uid())),'22023');
 perform ownership_transfer_test.denied(jsonb_set(req,'{base,target,role}','"owner"'),'22023');
 perform ownership_transfer_test.denied(req||'{"extra":true}','22023');
 perform ownership_transfer_test.denied(jsonb_set(req,'{base,actor,createdAt}','"2026-10-23T00:00:00Z"'),'42501');
end$$;
reset role;
insert into ownership_transfer_test.pending values('status',ownership_transfer_test.request(500,21));
update public.team_members set status='inactive' where id=ownership_transfer_test.id(21);
set role authenticated;
do $$declare result jsonb;begin result:=ownership_transfer_test.capture('status-conflict',(select request from ownership_transfer_test.pending where key='status'));assert result->>'status'='conflict','Current inactive target ignored';end$$;
reset role;
update public.team_members set status='active' where id=ownership_transfer_test.id(21);
-- An inactive base is invalid at HTTP schema; direct SQL also rejects it before transfer.
update public.team_members set status='inactive' where id=ownership_transfer_test.id(22);
set role authenticated;
select ownership_transfer_test.denied(ownership_transfer_test.request(505,22),'22023');
reset role;
update public.team_members set status='active' where id=ownership_transfer_test.id(22);
insert into ownership_transfer_test.pending values('missing',ownership_transfer_test.request(506,22));
delete from public.team_members where id=ownership_transfer_test.id(22);
set role authenticated;
do $$declare result jsonb;begin result:=ownership_transfer_test.capture('target-missing',(select request from ownership_transfer_test.pending where key='missing'));assert result->>'status'='missing' and result#>'{current,target}'='null'::jsonb,'Deleted target not missing';end$$;
select ownership_transfer_test.capture_state('fresh-missing',22);
reset role;
create function ownership_transfer_test.fail_receipt() returns trigger language plpgsql as $$begin if new.request_nonce=ownership_transfer_test.id(510) then raise exception 'Synthetic late failure' using errcode='23514';end if;return new;end$$;
create trigger ownership_transfer_test_failure before insert on private.mobile_ownership_transfer_receipts for each row execute function ownership_transfer_test.fail_receipt();
create table ownership_transfer_test.rollback_before as select (select jsonb_agg(to_jsonb(m) order by id) from public.team_members m) members,(select to_jsonb(t) from public.teams t where id=ownership_transfer_test.team()) team;
set role authenticated;
select ownership_transfer_test.denied(ownership_transfer_test.request(510,21),'23514');
reset role;
do $$begin assert (select members from ownership_transfer_test.rollback_before)=(select jsonb_agg(to_jsonb(m) order by id) from public.team_members m) and (select team from ownership_transfer_test.rollback_before)=(select to_jsonb(t) from public.teams t where id=ownership_transfer_test.team()) and not exists(select 1 from private.mobile_ownership_transfer_receipts where request_nonce=ownership_transfer_test.id(510)),'Late ledger failure left owner/team/membership changes';end$$;
drop trigger ownership_transfer_test_failure on private.mobile_ownership_transfer_receipts;
set role authenticated;
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(3)::text,false);
select ownership_transfer_test.denied(ownership_transfer_test.request(511,20),'42501');
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(5)::text,false);
select ownership_transfer_test.denied(ownership_transfer_test.request(512,20),'42501');
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(4)::text,false);
select ownership_transfer_test.denied(ownership_transfer_test.request(513,20),'42501');
reset role;
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(1)::text,false);
insert into ownership_transfer_test.pending values('applied',ownership_transfer_test.request(520,20));
set role authenticated;
do $$declare req jsonb;result jsonb;begin
 select request into req from ownership_transfer_test.pending where key='applied';result:=ownership_transfer_test.capture('applied-owner-to-admin',req);
 assert result->>'status'='applied' and result#>>'{current,actor,role}'='admin' and result#>>'{current,target,role}'='owner' and result#>'{current,target,customRoleId}'='null'::jsonb,'Exact website ownership semantics not confirmed';
 assert ownership_transfer_test.rpc(req)=result,'Demoted actor exact retry not stable';
 perform ownership_transfer_test.denied(jsonb_set(req,'{base,target,role}','"media"'),'22023');
 perform ownership_transfer_test.denied(jsonb_set(req,'{requestNonce}',to_jsonb(ownership_transfer_test.id(521))),'42501');
 perform ownership_transfer_test.denied_state(20,null,'42501');
 perform ownership_transfer_test.denied_state(21,520,'42501');
 perform ownership_transfer_test.denied_state(20,999,'42501');
end$$;
select ownership_transfer_test.capture_state('sealed-admin-recovery',20,520);
reset role;
do $$begin assert (select value from ownership_transfer_test.overrides_before)=(select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o),'Transfer changed permission overrides';end$$;
-- Losing the response must not cause a second transfer. Removing/replacing the
-- old actor membership also revokes the sealed recovery route.
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(6)::text,false);
set role authenticated;
select ownership_transfer_test.capture_state('new-current-owner',21);
reset role;
insert into ownership_transfer_test.ids select 'original-actor',id from public.team_members where team_id=ownership_transfer_test.team() and profile_id=ownership_transfer_test.id(1);
delete from public.team_members where id=(select id from ownership_transfer_test.ids where key='original-actor');
insert into public.team_members(id,team_id,profile_id,role,status,created_at) values((select id from ownership_transfer_test.ids where key='original-actor'),ownership_transfer_test.team(),ownership_transfer_test.id(1),'admin','active','2026-10-23T03:04:05.999999Z');
set role authenticated;
select set_config('request.jwt.claim.sub',ownership_transfer_test.id(1)::text,false);
select ownership_transfer_test.denied((select request from ownership_transfer_test.pending where key='applied'),'42501');
select ownership_transfer_test.denied_state(20,520,'42501');
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_ownership_transfer_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Ledger mutable';end$$;
set role authenticated;
do $$declare denied boolean:=false;begin begin perform 1 from private.mobile_ownership_transfer_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private ledger readable';end$$;
reset role;
set role anon;
do $$declare denied boolean:=false;begin begin perform public.mobile_apply_ownership_transfer(null,null,'{}');exception when insufficient_privilege then denied:=true;end;assert denied,'Anonymous transfer allowed';end$$;
reset role;
select 'PASS ownership CAS, atomic team/actor/target rollback, exact demoted recovery and incarnation denial' as result;
