\set ON_ERROR_STOP on
set timezone='UTC';
-- Synthetic disposable loopback fixtures only.
create schema custom_role_edit_test;
create function custom_role_edit_test.id(n integer) returns uuid language sql immutable as $$select ('99700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table custom_role_edit_test.ids(key text primary key,id uuid not null);
create table custom_role_edit_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
grant usage on schema custom_role_edit_test to authenticated;
grant select,insert on custom_role_edit_test.ids,custom_role_edit_test.cases to authenticated;
insert into auth.users(id,email) select custom_role_edit_test.id(n),'role-edit-'||n||'@example.test' from generate_series(1,6) n;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
insert into custom_role_edit_test.ids select 'team',team_id from public.create_team_workspace('Edit Roles A','REA-71023');
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(2)::text,false);
insert into custom_role_edit_test.ids select 'other',team_id from public.create_team_workspace('Edit Roles B','REB-71023');
create function custom_role_edit_test.team() returns uuid language sql stable as $$select id from custom_role_edit_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status) values
 (custom_role_edit_test.id(10),custom_role_edit_test.team(),custom_role_edit_test.id(3),'admin','active'),
 (custom_role_edit_test.id(11),custom_role_edit_test.team(),custom_role_edit_test.id(4),'owner','active'),
 (custom_role_edit_test.id(12),custom_role_edit_test.team(),custom_role_edit_test.id(5),'member','active'),
 (custom_role_edit_test.id(13),custom_role_edit_test.team(),custom_role_edit_test.id(6),'member','inactive');
insert into public.custom_roles(id,team_id,name,permissions,created_at) values
 (custom_role_edit_test.id(30),custom_role_edit_test.team(),'Existing',array['team.manage','events.manage'],null),
 (custom_role_edit_test.id(40),custom_role_edit_test.team(),'Precise legacy',array['team.manage','events.manage'],'2026-10-23T03:04:05.123456+00:00'),
 (custom_role_edit_test.id(41),custom_role_edit_test.team(),'Assigned',array[]::text[],null),
 (custom_role_edit_test.id(42),custom_role_edit_test.team(),'Rollback',array['songs.create'],null),
 (custom_role_edit_test.id(43),custom_role_edit_test.team(),'Race website',array['songs.create'],null),
 (custom_role_edit_test.id(44),custom_role_edit_test.team(),'Race delete',array['songs.create'],null),
 (custom_role_edit_test.id(45),custom_role_edit_test.team(),'',array[]::text[],null),
 (custom_role_edit_test.id(46),custom_role_edit_test.team(),'Race assignment',array[]::text[],null);
alter table public.custom_roles disable trigger custom_role_name_guard;
insert into public.custom_roles(id,team_id,name,permissions,created_at) values
 (custom_role_edit_test.id(48),custom_role_edit_test.team(),'Legacy Duplicate',array['team.manage','events.manage'],null),
 (custom_role_edit_test.id(49),custom_role_edit_test.team(),'LEGACY DUPLICATE',array[]::text[],null);
alter table public.custom_roles enable trigger custom_role_name_guard;
update public.team_members set custom_role_id=custom_role_edit_test.id(41) where id in (custom_role_edit_test.id(12),custom_role_edit_test.id(13));
create table custom_role_edit_test.catalog_snapshot as select to_jsonb(r) value from public.custom_roles r where id=custom_role_edit_test.id(40);
create table custom_role_edit_test.members_before as select jsonb_agg(to_jsonb(m) order by id) value from public.team_members m;
create function custom_role_edit_test.base(n integer) returns jsonb language sql stable as $$select jsonb_build_object('id',id,'teamId',team_id,'name',name,'permissions',permissions,'createdAt',created_at) from public.custom_roles where id=custom_role_edit_test.id(n)$$;
create function custom_role_edit_test.request(n integer,base jsonb,name text,permissions jsonb default '[]') returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',custom_role_edit_test.team(),'memberId',(select id from public.team_members where team_id=custom_role_edit_test.team() and profile_id=auth.uid() and status='active'),'requestNonce',custom_role_edit_test.id(n),'base',base,'value',jsonb_build_object('name',name,'permissions',permissions))
$$;
create function custom_role_edit_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_custom_role_edit((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function custom_role_edit_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=custom_role_edit_test.rpc(request);insert into custom_role_edit_test.cases values(label,request,result);return result;end$$;
create function custom_role_edit_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform custom_role_edit_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected edit denial '||expected;end$$;
set role authenticated;
do $$declare req jsonb;result jsonb;begin
 req:=custom_role_edit_test.request(200,custom_role_edit_test.base(40),'Updated precise','["events.manage","songs.create"]');result:=custom_role_edit_test.capture('owner-applied',req);
 assert result->>'status'='applied' and result#>'{current,createdAt}'=req#>'{base,createdAt}' and result#>>'{current,name}'='Updated precise','Exact edit not applied';
 assert custom_role_edit_test.rpc(req)=result,'Exact retry changed receipt';
 perform custom_role_edit_test.denied(jsonb_set(req,'{value,name}','"changed"'),'22023');
 perform custom_role_edit_test.denied(jsonb_set(req,'{base,name}','"changed"'),'22023');
 perform custom_role_edit_test.denied(jsonb_set(req,'{userId}',to_jsonb(custom_role_edit_test.id(2))),'42501');
 perform custom_role_edit_test.denied(req||'{"extra":true}','22023');
 perform custom_role_edit_test.denied(jsonb_set(req,'{value}','{"name":" ","permissions":[]}'),'22023');
 perform custom_role_edit_test.denied(jsonb_set(req,'{value,name}',to_jsonb(chr(9)||'Role')),'22023');
 perform custom_role_edit_test.denied(jsonb_set(req,'{value,name}',to_jsonb('Role'||chr(10))),'22023');
 perform custom_role_edit_test.denied(jsonb_set(req,'{value,name}',to_jsonb(chr(160)||'Role')),'22023');
 perform custom_role_edit_test.denied(jsonb_set(req,'{value,name}',to_jsonb('Role'||chr(65279))),'22023');
 perform custom_role_edit_test.denied(jsonb_set(req,'{value}','{"name":"Role","permissions":["team.manage","events.manage"]}'),'22023');
 perform custom_role_edit_test.denied(jsonb_set(req,'{value}','{"name":"Role","permissions":["team.manage","team.manage"]}'),'22023');
 perform custom_role_edit_test.denied(jsonb_set(req,'{value}','{"name":"Role","permissions":["system.superuser"]}'),'22023');
 result:=custom_role_edit_test.capture('missing',custom_role_edit_test.request(201,jsonb_set(req->'base','{id}',to_jsonb(custom_role_edit_test.id(90))),'Gone'));assert result->>'status'='missing' and result->'current'='null'::jsonb,'Missing role not reported';
 result:=custom_role_edit_test.capture('changed-base',jsonb_set(req,'{requestNonce}',to_jsonb(custom_role_edit_test.id(202))));assert result->>'status'='conflict','Changed role overwritten';
 result:=custom_role_edit_test.capture('ordered-permission-conflict',custom_role_edit_test.request(203,jsonb_set(custom_role_edit_test.base(30),'{permissions}','["events.manage","team.manage"]'),'Existing'));assert result->>'status'='conflict','Changed permission order overwritten';
 result:=custom_role_edit_test.capture('timestamp-conflict',custom_role_edit_test.request(204,jsonb_set(custom_role_edit_test.base(30),'{createdAt}','"2026-10-23T01:00:00Z"'),'Existing'));assert result->>'status'='conflict','Changed timestamp overwritten';
 result:=custom_role_edit_test.capture('duplicate-blocked',custom_role_edit_test.request(205,custom_role_edit_test.base(30),'UPDATED PRECISE'));assert result->>'status'='blocked' and result->>'reason'='existing_role' and result->'current'=result#>'{request,base}','Duplicate overwrote a role';
 result:=custom_role_edit_test.capture('legacy-empty-name',custom_role_edit_test.request(206,custom_role_edit_test.base(45),'Valid legacy name'));assert result->>'status'='applied','Legacy empty base rejected';
 result:=custom_role_edit_test.capture('legacy-duplicate-permission-edit',custom_role_edit_test.request(207,custom_role_edit_test.base(48),'Legacy Duplicate','["events.manage"]'));assert result->>'status'='applied','Unchanged legacy duplicate name blocked permissions';
 result:=custom_role_edit_test.capture('legacy-duplicate-case-rename',custom_role_edit_test.request(208,custom_role_edit_test.base(48),'legacy duplicate','["events.manage"]'));assert result->>'status'='blocked','Case-only rename bypassed duplicate boundary';
 result:=custom_role_edit_test.capture('assigned-permission-grant',custom_role_edit_test.request(209,custom_role_edit_test.base(41),'Assigned','["events.manage"]'));assert result->>'status'='applied','Assigned role permissions not edited';
end$$;
reset role;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(5)::text,false);
do $$begin assert private.has_team_permission(custom_role_edit_test.team(),'events.manage'),'Assigned member did not inherit granted permission';end$$;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
set role authenticated;
select custom_role_edit_test.capture('assigned-permission-revoke',custom_role_edit_test.request(210,custom_role_edit_test.base(41),'Assigned'));
reset role;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(5)::text,false);
do $$begin assert not private.has_team_permission(custom_role_edit_test.team(),'events.manage'),'Assigned member retained removed permission';end$$;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
do $$begin assert (select value from custom_role_edit_test.members_before)=(select jsonb_agg(to_jsonb(m) order by id) from public.team_members m),'Editing changed memberships';end$$;
-- A historical retry neither revives a deleted role nor overwrites a replacement.
delete from public.custom_roles where id=custom_role_edit_test.id(40);
set role authenticated;
do $$begin assert custom_role_edit_test.rpc((select request from custom_role_edit_test.cases where name='owner-applied'))=(select receipt from custom_role_edit_test.cases where name='owner-applied'),'Deleted role replay changed';assert not exists(select 1 from public.custom_roles where id=custom_role_edit_test.id(40)),'Retry revived deleted role';end$$;
reset role;
insert into public.custom_roles(id,team_id,name,permissions) values(custom_role_edit_test.id(40),custom_role_edit_test.team(),'Replacement',array['songs.edit']);
set role authenticated;
do $$begin perform custom_role_edit_test.rpc((select request from custom_role_edit_test.cases where name='owner-applied'));assert exists(select 1 from public.custom_roles where id=custom_role_edit_test.id(40) and name='Replacement' and permissions=array['songs.edit']),'Retry overwrote replacement';end$$;
reset role;
select public.set_team_permission_override(custom_role_edit_test.team(),null,custom_role_edit_test.id(10),'team.manage',true);
select public.set_team_permission_override(custom_role_edit_test.team(),null,custom_role_edit_test.id(12),'team.manage',true);
set role authenticated;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(3)::text,false);
select custom_role_edit_test.denied(custom_role_edit_test.request(211,custom_role_edit_test.base(30),'Admin denied'),'42501');
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(5)::text,false);
select custom_role_edit_test.denied(custom_role_edit_test.request(212,custom_role_edit_test.base(30),'Delegated denied'),'42501');
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(2)::text,false);
select custom_role_edit_test.denied(jsonb_set(custom_role_edit_test.request(213,(select request->'base' from custom_role_edit_test.cases where name='owner-applied'),'Foreign denied'),'{memberId}',to_jsonb(custom_role_edit_test.id(10))),'42501');
reset role;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
create function custom_role_edit_test.fail_receipt() returns trigger language plpgsql as $$begin if new.request_nonce=custom_role_edit_test.id(220) then raise exception 'Synthetic late failure' using errcode='23514';end if;return new;end$$;
create trigger custom_role_edit_test_failure before insert on private.mobile_custom_role_edit_receipts for each row execute function custom_role_edit_test.fail_receipt();
create table custom_role_edit_test.rollback_before as select to_jsonb(r) value from public.custom_roles r where id=custom_role_edit_test.id(42);
set role authenticated;
select custom_role_edit_test.denied(custom_role_edit_test.request(220,custom_role_edit_test.base(42),'Rollback changed','["events.manage"]'),'23514');
reset role;
do $$begin assert (select value from custom_role_edit_test.rollback_before)=(select to_jsonb(r) from public.custom_roles r where id=custom_role_edit_test.id(42)) and not exists(select 1 from private.mobile_custom_role_edit_receipts where request_nonce=custom_role_edit_test.id(220)),'Late receipt failure did not roll back edit';end$$;
drop trigger custom_role_edit_test_failure on private.mobile_custom_role_edit_receipts;
set role authenticated;
select custom_role_edit_test.capture('rollback-retry',custom_role_edit_test.request(220,custom_role_edit_test.base(42),'Rollback changed','["events.manage"]'));
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(4)::text,false);
select custom_role_edit_test.capture('second-owner-applied',custom_role_edit_test.request(221,custom_role_edit_test.base(30),'Existing','["events.manage"]'));
reset role;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
select public.transfer_team_ownership(custom_role_edit_test.team(),custom_role_edit_test.id(11));
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(4)::text,false);
select public.transfer_team_ownership(custom_role_edit_test.team(),(select id from public.team_members where team_id=custom_role_edit_test.team() and profile_id=custom_role_edit_test.id(1)));
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(1)::text,false);
select public.set_team_permission_override(custom_role_edit_test.team(),null,custom_role_edit_test.id(11),'team.manage',true);
set role authenticated;
select set_config('request.jwt.claim.sub',custom_role_edit_test.id(4)::text,false);
select custom_role_edit_test.denied((select request from custom_role_edit_test.cases where name='second-owner-applied'),'42501');
do $$declare denied boolean:=false;begin begin perform 1 from private.mobile_custom_role_edit_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private ledger readable';end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_custom_role_edit_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Ledger mutable';end$$;
set role anon;
do $$declare denied boolean:=false;begin begin perform public.mobile_apply_custom_role_edit(null,null,'{}');exception when insufficient_privilege then denied:=true;end;assert denied,'Anonymous edit allowed';end$$;
reset role;
select 'PASS role editing CAS, inherited permissions, duplicate preservation, rollback and current owner replay boundary' as result;
