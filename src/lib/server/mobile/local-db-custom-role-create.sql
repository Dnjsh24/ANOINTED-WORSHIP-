\set ON_ERROR_STOP on
set timezone='UTC';
-- Synthetic disposable loopback verification only, never hosted data.
create schema custom_role_create_test;
create function custom_role_create_test.id(n integer) returns uuid language sql immutable as $$select ('99500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table custom_role_create_test.ids(key text primary key,id uuid not null);
create table custom_role_create_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
grant usage on schema custom_role_create_test to authenticated;
grant select,insert on custom_role_create_test.ids,custom_role_create_test.cases to authenticated;
insert into auth.users(id,email) select custom_role_create_test.id(n),'role-'||n||'@example.test' from generate_series(1,5) n;
select set_config('request.jwt.claim.sub',custom_role_create_test.id(1)::text,false);
insert into custom_role_create_test.ids select 'team',team_id from public.create_team_workspace('Roles A','RA-71022');
select set_config('request.jwt.claim.sub',custom_role_create_test.id(2)::text,false);
insert into custom_role_create_test.ids select 'other',team_id from public.create_team_workspace('Roles B','RB-71022');
create function custom_role_create_test.team() returns uuid language sql stable as $$select id from custom_role_create_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',custom_role_create_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status) values
 (custom_role_create_test.id(10),custom_role_create_test.team(),custom_role_create_test.id(3),'admin','active'),
 (custom_role_create_test.id(11),custom_role_create_test.team(),custom_role_create_test.id(4),'owner','active'),
 (custom_role_create_test.id(12),custom_role_create_test.team(),custom_role_create_test.id(5),'member','active');
insert into public.custom_roles(id,team_id,name,permissions) values(custom_role_create_test.id(30),custom_role_create_test.team(),'Existing Role',array['songs.create']);
alter table public.custom_roles disable trigger custom_role_name_guard;
insert into public.custom_roles(id,team_id,name,permissions,created_at) values
 (custom_role_create_test.id(31),custom_role_create_test.team(),'LEGACY role',array['songs.edit'],null),
 (custom_role_create_test.id(32),custom_role_create_test.team(),'legacy ROLE',array['unknownLegacyPermission'],null);
alter table public.custom_roles enable trigger custom_role_name_guard;
create table custom_role_create_test.members_before as select jsonb_agg(to_jsonb(m) order by id) value from public.team_members m;
create function custom_role_create_test.request(n integer,name text,permissions jsonb default '[]') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',custom_role_create_test.team(),'memberId',(select id from public.team_members where team_id=custom_role_create_test.team() and profile_id=auth.uid() and status='active'),
 'requestNonce',custom_role_create_test.id(n),'name',name,'permissions',permissions)
$$;
create function custom_role_create_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_custom_role_create((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function custom_role_create_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=custom_role_create_test.rpc(request);insert into custom_role_create_test.cases values(label,request,result);return result;end$$;
create function custom_role_create_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform custom_role_create_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected role creation denial '||expected;end$$;
set role authenticated;
do $$declare req jsonb;result jsonb;prior jsonb;begin
 req:=custom_role_create_test.request(200,'Rehearsal coordinator','["events.manage","setlists.manage"]');result:=custom_role_create_test.capture('owner-created',req);
 assert result->>'status'='applied' and result#>>'{current,name}'='Rehearsal coordinator' and result#>'{current,permissions}'='["events.manage","setlists.manage"]','Exact role not created';
 select to_jsonb(r) into prior from public.custom_roles r where id=(result#>>'{current,id}')::uuid;
 assert custom_role_create_test.rpc(req)=result and prior=(select to_jsonb(r) from public.custom_roles r where id=(result#>>'{current,id}')::uuid),'Exact retry rewrote role or time';
 perform custom_role_create_test.denied(jsonb_set(req,'{name}','"Changed intent"'),'22023');
 perform custom_role_create_test.denied(jsonb_set(req,'{permissions}','[]'),'22023');
 perform custom_role_create_test.denied(jsonb_set(req,'{userId}',to_jsonb(custom_role_create_test.id(2))),'42501');
 perform custom_role_create_test.denied(jsonb_set(req,'{memberId}',to_jsonb(custom_role_create_test.id(10))),'42501');
 perform custom_role_create_test.denied(req||'{"description":"invented"}','22023');
 perform custom_role_create_test.denied(req||'{"assignToMember":"unexpected"}','22023');
 perform custom_role_create_test.denied(jsonb_set(req,'{version}','null'),'22023');
 perform custom_role_create_test.denied(custom_role_create_test.request(201,' '),'22023');
 perform custom_role_create_test.denied(custom_role_create_test.request(201,repeat('x',161)),'22023');
 perform custom_role_create_test.denied(custom_role_create_test.request(201,'Unknown','["system.superuser"]'),'22023');
 perform custom_role_create_test.denied(custom_role_create_test.request(201,'Duplicate permissions','["team.manage","team.manage"]'),'22023');
 perform custom_role_create_test.denied(custom_role_create_test.request(201,'Unsorted permissions','["team.manage","events.manage"]'),'22023');
 result:=custom_role_create_test.capture('empty-permissions-created',custom_role_create_test.request(202,'No permissions'));assert result#>'{current,permissions}'='[]','Empty permissions not preserved';
 result:=custom_role_create_test.capture('maximum-name-created',custom_role_create_test.request(203,repeat('あ',160)));assert result->>'status'='applied','160-character role name rejected';
 select jsonb_agg(to_jsonb(r) order by id) into prior from public.custom_roles r where team_id=custom_role_create_test.team();
 result:=custom_role_create_test.capture('existing-casefold-blocked',custom_role_create_test.request(204,'existing ROLE','["team.manage"]'));assert result->>'status'='blocked' and result->>'reason'='existing_role' and result->'current'='null'::jsonb,'Existing role not blocked';
 result:=custom_role_create_test.capture('legacy-duplicates-blocked',custom_role_create_test.request(205,'Legacy role'));assert result->>'status'='blocked','Legacy duplicates not blocked';
 assert prior=(select jsonb_agg(to_jsonb(r) order by id) from public.custom_roles r where team_id=custom_role_create_test.team()),'Duplicate handling rewrote prior roles';
end$$;
reset role;
do $$begin assert (select value from custom_role_create_test.members_before)=(select jsonb_agg(to_jsonb(m) order by id) from public.team_members m),'Creation assigned or modified a membership';end$$;
set role authenticated;
do $$declare denied boolean:=false;begin begin insert into public.custom_roles(team_id,name,permissions) values(custom_role_create_test.team(),'EXISTING ROLE','{}');exception when unique_violation then denied:=true;end;assert denied,'Website insert bypassed casefold guard';end$$;
reset role;
-- Effective team.manage does not replace the actual owner-only custom-role boundary.
select public.set_team_permission_override(custom_role_create_test.team(),null,custom_role_create_test.id(10),'team.manage',true);
select public.set_team_permission_override(custom_role_create_test.team(),null,custom_role_create_test.id(12),'team.manage',true);
set role authenticated;
select set_config('request.jwt.claim.sub',custom_role_create_test.id(3)::text,false);
select custom_role_create_test.denied(custom_role_create_test.request(210,'Admin denied'),'42501');
do $$declare denied boolean:=false;begin begin insert into public.custom_roles(team_id,name,permissions) values(custom_role_create_test.team(),'Admin direct denied','{}');exception when insufficient_privilege then denied:=true;end;assert denied,'Nonowner direct insertion allowed';end$$;
select set_config('request.jwt.claim.sub',custom_role_create_test.id(5)::text,false);
select custom_role_create_test.denied(custom_role_create_test.request(211,'Delegated denied'),'42501');
reset role;
select set_config('request.jwt.claim.sub',custom_role_create_test.id(1)::text,false);
-- Late receipt insertion failure must roll back the newly inserted role.
create function custom_role_create_test.fail_receipt() returns trigger language plpgsql as $$begin if new.request->>'name'='Rollback role' then raise exception 'Synthetic late receipt failure' using errcode='23514';end if;return new;end$$;
create trigger custom_role_create_test_failure before insert on private.mobile_custom_role_create_receipts for each row execute function custom_role_create_test.fail_receipt();
set role authenticated;
select custom_role_create_test.denied(custom_role_create_test.request(220,'Rollback role'),'23514');
reset role;
do $$begin assert not exists(select 1 from public.custom_roles where name='Rollback role') and not exists(select 1 from private.mobile_custom_role_create_receipts where request_nonce=custom_role_create_test.id(220)),'Late failure left a role or receipt';end$$;
drop trigger custom_role_create_test_failure on private.mobile_custom_role_create_receipts;
set role authenticated;
select custom_role_create_test.capture('rollback-exact-retry',custom_role_create_test.request(220,'Rollback role'));
select set_config('request.jwt.claim.sub',custom_role_create_test.id(4)::text,false);
select custom_role_create_test.capture('second-owner-created',custom_role_create_test.request(221,'Second owner role'));
reset role;
select set_config('request.jwt.claim.sub',custom_role_create_test.id(1)::text,false);
-- Use the existing ownership-transfer workflow to model real authority loss.
select public.transfer_team_ownership(custom_role_create_test.team(),custom_role_create_test.id(11));
select set_config('request.jwt.claim.sub',custom_role_create_test.id(4)::text,false);
select public.transfer_team_ownership(custom_role_create_test.team(),(select id from public.team_members where team_id=custom_role_create_test.team() and profile_id=custom_role_create_test.id(1)));
select set_config('request.jwt.claim.sub',custom_role_create_test.id(1)::text,false);
select public.set_team_permission_override(custom_role_create_test.team(),null,custom_role_create_test.id(11),'team.manage',true);
set role authenticated;
select set_config('request.jwt.claim.sub',custom_role_create_test.id(4)::text,false);
select custom_role_create_test.denied((select request from custom_role_create_test.cases where name='second-owner-created'),'42501');
reset role;
select set_config('request.jwt.claim.sub',custom_role_create_test.id(1)::text,false);
delete from public.custom_roles where name='Rehearsal coordinator';
set role authenticated;
do $$declare req jsonb;denied boolean:=false;begin
 select request into req from custom_role_create_test.cases where name='owner-created';assert custom_role_create_test.rpc(req)=(select receipt from custom_role_create_test.cases where name='owner-created'),'Historical receipt changed';
 assert not exists(select 1 from public.custom_roles where name='Rehearsal coordinator'),'Historical retry revived deleted role';
 begin perform 1 from private.mobile_custom_role_create_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private role receipt ledger readable';
end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_custom_role_create_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Immutable role receipt edited';end$$;
select 'PASS owner-only unassigned custom-role creation, canonical permissions, duplicate preservation, late rollback, current authority and non-revival' as result;
