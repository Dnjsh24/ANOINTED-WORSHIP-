\set ON_ERROR_STOP on
set timezone='UTC';
create schema custom_role_retirement_test;
create function custom_role_retirement_test.id(n integer) returns uuid language sql immutable as $$select ('99860000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table custom_role_retirement_test.ids(key text primary key,id uuid not null);
create table custom_role_retirement_test.cases(name text primary key,identity jsonb not null,request jsonb not null,receipt jsonb not null);
create table custom_role_retirement_test.states(name text primary key,identity jsonb not null,state jsonb not null);
create table custom_role_retirement_test.pending(key text primary key,request jsonb not null);
grant usage on schema custom_role_retirement_test to authenticated;
grant select,insert on all tables in schema custom_role_retirement_test to authenticated;
insert into auth.users(id,email) select custom_role_retirement_test.id(n),'retirement-'||n||'@example.test' from generate_series(1,12) n;
insert into auth.users(id,email) select custom_role_retirement_test.id(n),'retirement-limit-'||n||'@example.test' from generate_series(200,300) n;
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
insert into custom_role_retirement_test.ids select 'team',team_id from public.create_team_workspace('Retire roles A','RTA-71023');
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(2)::text,false);
insert into custom_role_retirement_test.ids select 'other',team_id from public.create_team_workspace('Retire roles B','RTB-71023');
create function custom_role_retirement_test.team() returns uuid language sql stable as $$select id from custom_role_retirement_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
insert into public.custom_roles(id,team_id,name,permissions,created_at) values
 (custom_role_retirement_test.id(40),custom_role_retirement_test.team(),'',array['team.manage','events.manage'],'2026-10-23T03:04:05.123456Z'),
 (custom_role_retirement_test.id(41),custom_role_retirement_test.team(),'CAS',array[]::text[],null),
 (custom_role_retirement_test.id(42),custom_role_retirement_test.team(),'Rollback',array[]::text[],null),
 (custom_role_retirement_test.id(43),custom_role_retirement_test.team(),'Race new assignment',array[]::text[],null),
 (custom_role_retirement_test.id(44),custom_role_retirement_test.team(),'Race after retire',array[]::text[],null),
 (custom_role_retirement_test.id(45),custom_role_retirement_test.team(),'Race website role',array['songs.create'],null),
 (custom_role_retirement_test.id(46),custom_role_retirement_test.team(),'Race member replacement',array[]::text[],null),
 (custom_role_retirement_test.id(47),custom_role_retirement_test.team(),'Protected owner',array[]::text[],null),
 (custom_role_retirement_test.id(48),custom_role_retirement_test.team(),'Limit',array[]::text[],null),
 (custom_role_retirement_test.id(49),custom_role_retirement_test.team(),'Missing',array[]::text[],null);
insert into public.team_members(id,team_id,profile_id,role,status,custom_role_id,created_at,ministry) values
 (custom_role_retirement_test.id(10),custom_role_retirement_test.team(),custom_role_retirement_test.id(3),'admin','active',null,'2026-10-23T03:00:00Z','Admin'),
 (custom_role_retirement_test.id(11),custom_role_retirement_test.team(),custom_role_retirement_test.id(4),'owner','active',custom_role_retirement_test.id(47),'2026-10-23T03:00:00Z','Protected'),
 (custom_role_retirement_test.id(12),custom_role_retirement_test.team(),custom_role_retirement_test.id(5),'member','active',custom_role_retirement_test.id(40),'2026-10-23T03:04:05.123456Z','Precise'),
 (custom_role_retirement_test.id(13),custom_role_retirement_test.team(),custom_role_retirement_test.id(6),'member','inactive',custom_role_retirement_test.id(40),'2026-10-23T03:00:00Z','Inactive'),
 (custom_role_retirement_test.id(14),custom_role_retirement_test.team(),custom_role_retirement_test.id(7),'member','active',custom_role_retirement_test.id(41),'2026-10-23T03:00:00Z','CAS'),
 (custom_role_retirement_test.id(15),custom_role_retirement_test.team(),custom_role_retirement_test.id(8),'member','active',custom_role_retirement_test.id(42),'2026-10-23T03:00:00Z','Rollback A'),
 (custom_role_retirement_test.id(16),custom_role_retirement_test.team(),custom_role_retirement_test.id(9),'band_member','inactive',custom_role_retirement_test.id(42),'2026-10-23T03:00:00Z','Rollback B'),
 (custom_role_retirement_test.id(17),custom_role_retirement_test.team(),custom_role_retirement_test.id(10),'member','active',custom_role_retirement_test.id(46),'2026-10-23T03:00:00Z','Replacement');
insert into public.team_members(id,team_id,profile_id,role,status,custom_role_id) select custom_role_retirement_test.id(n+1000),custom_role_retirement_test.team(),custom_role_retirement_test.id(n),'member','active',custom_role_retirement_test.id(48) from generate_series(200,300) n;
select public.set_team_permission_override(custom_role_retirement_test.team(),null,custom_role_retirement_test.id(12),'songs.edit',false);
select public.set_team_permission_override(custom_role_retirement_test.team(),null,custom_role_retirement_test.id(10),'team.manage',true);
select public.set_team_permission_override(custom_role_retirement_test.team(),null,custom_role_retirement_test.id(14),'team.manage',true);
select public.set_team_permission_override(custom_role_retirement_test.team(),null,custom_role_retirement_test.id(14),'members.manage',true);
create table custom_role_retirement_test.overrides_before as select jsonb_agg(to_jsonb(o) order by id) value from public.team_permission_overrides o;
create function custom_role_retirement_test.identity() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',auth.uid(),'teamId',m.team_id,'memberId',m.id,'teamName',t.name,'role',m.role,'permissions',jsonb_build_array('team.manage','members.manage'))
 from public.team_members m join public.teams t on t.id=m.team_id where m.team_id=custom_role_retirement_test.team() and m.profile_id=auth.uid() and m.status='active'
$$;
create function custom_role_retirement_test.base(n integer) returns jsonb language sql volatile security definer set search_path='' as $$select private.mobile_custom_role_retirement_selection(r) from public.custom_roles r where id=custom_role_retirement_test.id(n)$$;
create function custom_role_retirement_test.request(n integer,target integer,replacement text default 'band_member') returns jsonb language sql volatile security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',custom_role_retirement_test.team(),'memberId',custom_role_retirement_test.identity()->'memberId','requestNonce',custom_role_retirement_test.id(n),'base',custom_role_retirement_test.base(target),'replacementRole',replacement)
$$;
create function custom_role_retirement_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_custom_role_retirement((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function custom_role_retirement_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=custom_role_retirement_test.rpc(request);insert into custom_role_retirement_test.cases values(label,custom_role_retirement_test.identity(),request,result);return result;end$$;
create function custom_role_retirement_test.capture_state(label text,target integer) returns jsonb language plpgsql as $$declare result jsonb;begin result:=public.mobile_read_custom_role_retirement_state(custom_role_retirement_test.team(),(custom_role_retirement_test.identity()->>'memberId')::uuid,custom_role_retirement_test.id(target));insert into custom_role_retirement_test.states values(label,custom_role_retirement_test.identity(),result);return result;end$$;
create function custom_role_retirement_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform custom_role_retirement_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected retirement denial '||expected;end$$;
create function custom_role_retirement_test.members(n integer) returns jsonb language sql stable security definer set search_path='' as $$select coalesce(jsonb_agg(to_jsonb(m) order by id),'[]') from public.team_members m where custom_role_id=custom_role_retirement_test.id(n)$$;
create table custom_role_retirement_test.before_rows as select n,custom_role_retirement_test.members(n) members,to_jsonb(r) role from unnest(array[40,42,47,48]) n join public.custom_roles r on r.id=custom_role_retirement_test.id(n);
set role authenticated;
select custom_role_retirement_test.capture_state('precise-complete',40);
select custom_role_retirement_test.capture_state('protected-owner',47);
select custom_role_retirement_test.capture_state('oversize-no-partial',48);
select custom_role_retirement_test.capture_state('missing',90);
do $$declare req jsonb;result jsonb;begin
 req:=custom_role_retirement_test.request(500,40);result:=custom_role_retirement_test.capture('owner-applied',req);
 assert result->>'status'='applied' and result->'current'='null'::jsonb,'Retirement not applied';
 assert custom_role_retirement_test.rpc(req)=result,'Exact retry changed receipt';
 perform custom_role_retirement_test.denied(jsonb_set(req,'{replacementRole}','"media"'),'22023');
 result:=custom_role_retirement_test.capture('already-missing',jsonb_set(req,'{requestNonce}',to_jsonb(custom_role_retirement_test.id(501))));assert result->>'status'='missing','Already retired not missing';
 result:=custom_role_retirement_test.capture('role-name-conflict',jsonb_set(custom_role_retirement_test.request(502,41),'{base,role,name}','"old"'));assert result->>'status'='conflict','Role changed name ignored';
 result:=custom_role_retirement_test.capture('role-time-conflict',jsonb_set(custom_role_retirement_test.request(503,41),'{base,role,createdAt}','"2026-10-23T03:00:00Z"'));assert result->>'status'='conflict','Role timestamp ignored';
 result:=custom_role_retirement_test.capture('missing-assignment-conflict',jsonb_set(custom_role_retirement_test.request(504,41),'{base,members}','[]'));assert result->>'status'='conflict','Incomplete assignments accepted';
 result:=custom_role_retirement_test.capture('member-status-conflict',jsonb_set(custom_role_retirement_test.request(505,41),'{base,members,0,status}','"inactive"'));assert result->>'status'='conflict','Member status ignored';
 result:=custom_role_retirement_test.capture('member-profile-conflict',jsonb_set(custom_role_retirement_test.request(506,41),'{base,members,0,profileId}',to_jsonb(custom_role_retirement_test.id(2))));assert result->>'status'='conflict','Member replacement ignored';
 result:=custom_role_retirement_test.capture('member-time-conflict',jsonb_set(custom_role_retirement_test.request(507,41),'{base,members,0,createdAt}','"2026-10-23T03:00:00.000001Z"'));assert result->>'status'='conflict','Member timestamp ignored';
 result:=custom_role_retirement_test.capture('protected-owner-blocked',custom_role_retirement_test.request(508,47));assert result->>'status'='blocked' and result->>'reason'='protected_member' and result->'current'=result#>'{request,base}','Protected assignment not blocked';
 result:=custom_role_retirement_test.capture('oversize-blocked',jsonb_set(custom_role_retirement_test.request(509,48),'{base,members}','[]'));assert result->>'status'='blocked' and result->>'reason'='member_limit' and result->'current'='null'::jsonb,'Oversize retirement not blocked';
 perform custom_role_retirement_test.denied(custom_role_retirement_test.request(510,48),'22023');
 perform custom_role_retirement_test.denied(jsonb_set(custom_role_retirement_test.request(511,41),'{replacementRole}','"owner"'),'22023');
 perform custom_role_retirement_test.denied(jsonb_set(custom_role_retirement_test.request(512,41),'{userId}',to_jsonb(custom_role_retirement_test.id(2))),'42501');
 perform custom_role_retirement_test.denied(custom_role_retirement_test.request(513,41)||'{"extra":true}','22023');
end$$;
reset role;
do $$declare old_members jsonb;begin
 select members into old_members from custom_role_retirement_test.before_rows where n=40;
 assert not exists(select 1 from public.custom_roles where id=custom_role_retirement_test.id(40)) and (select count(*)=2 and bool_and(role='band_member' and custom_role_id is null) from public.team_members where id in(custom_role_retirement_test.id(12),custom_role_retirement_test.id(13))),'Not all members reassigned';
 assert (select jsonb_agg(item-array['role','custom_role_id','updated_at'] order by item->>'id') from jsonb_array_elements(old_members) item)=(select jsonb_agg(to_jsonb(m)-array['role','custom_role_id','updated_at'] order by id) from public.team_members m where id in(custom_role_retirement_test.id(12),custom_role_retirement_test.id(13))),'Assignment changed status/profile/ministry/time';
 assert (select value from custom_role_retirement_test.overrides_before)=(select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o),'Retirement changed permission overrides';
 assert (select members from custom_role_retirement_test.before_rows where n=47)=custom_role_retirement_test.members(47) and (select members from custom_role_retirement_test.before_rows where n=48)=custom_role_retirement_test.members(48),'Blocked retirement mutated assignments';
end$$;
-- A replacement with the old role ID must survive a lost-reply retry.
insert into public.custom_roles(id,team_id,name,permissions) values(custom_role_retirement_test.id(40),custom_role_retirement_test.team(),'Replacement role',array['songs.edit']);
update public.team_members set custom_role_id=custom_role_retirement_test.id(40) where id=custom_role_retirement_test.id(12);
set role authenticated;
select custom_role_retirement_test.rpc((select request from custom_role_retirement_test.cases where name='owner-applied'));
reset role;
do $$begin assert exists(select 1 from public.custom_roles where id=custom_role_retirement_test.id(40) and name='Replacement role') and exists(select 1 from public.team_members where id=custom_role_retirement_test.id(12) and custom_role_id=custom_role_retirement_test.id(40)),'Exact retry retired replacement';end$$;
create function custom_role_retirement_test.fail_receipt() returns trigger language plpgsql as $$begin if new.request_nonce=custom_role_retirement_test.id(520) then raise exception 'Synthetic late failure' using errcode='23514';end if;return new;end$$;
create trigger custom_role_retirement_test_failure before insert on private.mobile_custom_role_retirement_receipts for each row execute function custom_role_retirement_test.fail_receipt();
set role authenticated;
select custom_role_retirement_test.denied(custom_role_retirement_test.request(520,42),'23514');
reset role;
do $$begin assert (select members from custom_role_retirement_test.before_rows where n=42)=custom_role_retirement_test.members(42) and (select role from custom_role_retirement_test.before_rows where n=42)=(select to_jsonb(r) from public.custom_roles r where id=custom_role_retirement_test.id(42)) and not exists(select 1 from private.mobile_custom_role_retirement_receipts where request_nonce=custom_role_retirement_test.id(520)),'Late ledger failure did not roll back all assignments and role';end$$;
drop trigger custom_role_retirement_test_failure on private.mobile_custom_role_retirement_receipts;
set role authenticated;
select custom_role_retirement_test.capture('rollback-exact-retry',custom_role_retirement_test.request(520,42,'media'));
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(3)::text,false);
select custom_role_retirement_test.denied(custom_role_retirement_test.request(530,41),'42501');
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(7)::text,false);
select custom_role_retirement_test.denied(custom_role_retirement_test.request(531,41),'42501');
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(4)::text,false);
select custom_role_retirement_test.denied(custom_role_retirement_test.request(532,41),'42501');
reset role;
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
select public.transfer_team_ownership(custom_role_retirement_test.team(),custom_role_retirement_test.id(11));
set role authenticated;
select custom_role_retirement_test.denied((select request from custom_role_retirement_test.cases where name='owner-applied'),'42501');
reset role;
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(4)::text,false);
select public.transfer_team_ownership(custom_role_retirement_test.team(),(select id from public.team_members where team_id=custom_role_retirement_test.team() and profile_id=custom_role_retirement_test.id(1)));
select set_config('request.jwt.claim.sub',custom_role_retirement_test.id(1)::text,false);
set role authenticated;
do $$declare denied boolean:=false;begin begin perform 1 from private.mobile_custom_role_retirement_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private ledger readable';end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_custom_role_retirement_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Ledger mutable';end$$;
set role anon;
do $$declare denied boolean:=false;begin begin perform public.mobile_apply_custom_role_retirement(null,null,'{}');exception when insufficient_privilege then denied:=true;end;assert denied,'Anonymous retirement allowed';end$$;
reset role;
select 'PASS bounded role retirement, exact membership/role CAS, protected members, preserved overrides and all-or-nothing rollback' as result;
