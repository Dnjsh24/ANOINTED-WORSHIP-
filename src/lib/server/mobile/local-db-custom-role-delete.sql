\set ON_ERROR_STOP on
set timezone='UTC';
-- Disposable loopback fixtures only.
create schema custom_role_delete_test;
create function custom_role_delete_test.id(n integer) returns uuid language sql immutable as $$select ('99600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table custom_role_delete_test.ids(key text primary key,id uuid not null);
create table custom_role_delete_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
grant usage on schema custom_role_delete_test to authenticated;
grant select,insert on custom_role_delete_test.ids,custom_role_delete_test.cases to authenticated;
insert into auth.users(id,email) select custom_role_delete_test.id(n),'role-delete-'||n||'@example.test' from generate_series(1,6) n;
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(1)::text,false);
insert into custom_role_delete_test.ids select 'team',team_id from public.create_team_workspace('Delete Roles A','RDA-71022');
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(2)::text,false);
insert into custom_role_delete_test.ids select 'other',team_id from public.create_team_workspace('Delete Roles B','RDB-71022');
create function custom_role_delete_test.team() returns uuid language sql stable as $$select id from custom_role_delete_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status) values
 (custom_role_delete_test.id(10),custom_role_delete_test.team(),custom_role_delete_test.id(3),'admin','active'),
 (custom_role_delete_test.id(11),custom_role_delete_test.team(),custom_role_delete_test.id(4),'owner','active'),
 (custom_role_delete_test.id(12),custom_role_delete_test.team(),custom_role_delete_test.id(5),'member','active'),
 (custom_role_delete_test.id(13),custom_role_delete_test.team(),custom_role_delete_test.id(6),'member','inactive');
insert into public.custom_roles(id,team_id,name,permissions,created_at) values
 (custom_role_delete_test.id(30),custom_role_delete_test.team(),'Existing',array['team.manage','events.manage'],null),
 (custom_role_delete_test.id(40),custom_role_delete_test.team(),'Unused',array['team.manage','events.manage'],'2026-10-22T03:04:05.123456+00:00'),
 (custom_role_delete_test.id(41),custom_role_delete_test.team(),'Assigned',array['songs.create'],null),
 (custom_role_delete_test.id(42),custom_role_delete_test.team(),'Rollback',array['songs.create'],null),
 (custom_role_delete_test.id(43),custom_role_delete_test.team(),'Race assignment',array['songs.create'],null),
 (custom_role_delete_test.id(44),custom_role_delete_test.team(),'Race deletion',array['songs.create'],null),
 (custom_role_delete_test.id(45),custom_role_delete_test.team(),'',array[]::text[],null);
update public.team_members set custom_role_id=custom_role_delete_test.id(41) where id=custom_role_delete_test.id(13);
create table custom_role_delete_test.catalog_snapshot as select to_jsonb(r) value from public.custom_roles r where id=custom_role_delete_test.id(40);
create table custom_role_delete_test.members_before as select jsonb_agg(to_jsonb(m) order by id) value from public.team_members m;
create function custom_role_delete_test.base(n integer) returns jsonb language sql stable as $$select jsonb_build_object('id',id,'teamId',team_id,'name',name,'permissions',permissions,'createdAt',created_at) from public.custom_roles where id=custom_role_delete_test.id(n)$$;
create function custom_role_delete_test.request(n integer,base jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',custom_role_delete_test.team(),'memberId',(select id from public.team_members where team_id=custom_role_delete_test.team() and profile_id=auth.uid() and status='active'),'requestNonce',custom_role_delete_test.id(n),'base',base)
$$;
create function custom_role_delete_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_custom_role_delete((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function custom_role_delete_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=custom_role_delete_test.rpc(request);insert into custom_role_delete_test.cases values(label,request,result);return result;end$$;
create function custom_role_delete_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform custom_role_delete_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected deletion denial '||expected;end$$;
set role authenticated;
do $$declare req jsonb;result jsonb;begin
 req:=custom_role_delete_test.request(200,custom_role_delete_test.base(40));result:=custom_role_delete_test.capture('owner-applied',req);
 assert result->>'status'='applied' and result->'current'='null'::jsonb,'Unused role not deleted';
 assert custom_role_delete_test.rpc(req)=result,'Exact retry changed receipt';
 perform custom_role_delete_test.denied(jsonb_set(req,'{base,name}','"changed"'),'22023');
 perform custom_role_delete_test.denied(jsonb_set(req,'{userId}',to_jsonb(custom_role_delete_test.id(2))),'42501');
 perform custom_role_delete_test.denied(req||'{"extra":true}','22023');
 result:=custom_role_delete_test.capture('missing',jsonb_set(req,'{requestNonce}',to_jsonb(custom_role_delete_test.id(201))));assert result->>'status'='missing','Missing role not reported';
 result:=custom_role_delete_test.capture('changed-base',custom_role_delete_test.request(202,jsonb_set(custom_role_delete_test.base(30),'{name}','"old"')));assert result->>'status'='conflict','Changed name deleted';
 result:=custom_role_delete_test.capture('ordered-permission-conflict',custom_role_delete_test.request(203,jsonb_set(custom_role_delete_test.base(30),'{permissions}','["events.manage","team.manage"]')));assert result->>'status'='conflict','Changed permission order deleted';
 result:=custom_role_delete_test.capture('timestamp-conflict',custom_role_delete_test.request(206,jsonb_set(custom_role_delete_test.base(30),'{createdAt}','"2026-10-22T01:00:00Z"')));assert result->>'status'='conflict','Changed timestamp deleted';
 result:=custom_role_delete_test.capture('assigned-inactive',custom_role_delete_test.request(204,custom_role_delete_test.base(41)));assert result->>'status'='blocked' and result->>'reason'='assigned_role' and result->'current'=result#>'{request,base}','Assigned role not preserved';
 result:=custom_role_delete_test.capture('legacy-empty-name',custom_role_delete_test.request(205,custom_role_delete_test.base(45)));assert result->>'status'='applied','Legacy empty name rejected';
end$$;
reset role;
do $$begin assert (select value from custom_role_delete_test.members_before)=(select jsonb_agg(to_jsonb(m) order by id) from public.team_members m),'Deletion modified memberships';end$$;
insert into public.custom_roles(id,team_id,name,permissions) values(custom_role_delete_test.id(40),custom_role_delete_test.team(),'Replacement',array['songs.edit']);
set role authenticated;
do $$begin assert custom_role_delete_test.rpc((select request from custom_role_delete_test.cases where name='owner-applied'))=(select receipt from custom_role_delete_test.cases where name='owner-applied'),'Historical receipt changed';assert exists(select 1 from public.custom_roles where id=custom_role_delete_test.id(40) and name='Replacement'),'Retry deleted replacement';end$$;
reset role;
select public.set_team_permission_override(custom_role_delete_test.team(),null,custom_role_delete_test.id(10),'team.manage',true);
select public.set_team_permission_override(custom_role_delete_test.team(),null,custom_role_delete_test.id(12),'team.manage',true);
set role authenticated;
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(3)::text,false);
select custom_role_delete_test.denied(custom_role_delete_test.request(210,custom_role_delete_test.base(30)),'42501');
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(5)::text,false);
select custom_role_delete_test.denied(custom_role_delete_test.request(211,custom_role_delete_test.base(30)),'42501');
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(2)::text,false);
select custom_role_delete_test.denied(jsonb_set(custom_role_delete_test.request(212,(select request->'base' from custom_role_delete_test.cases where name='changed-base')),'{memberId}',to_jsonb(custom_role_delete_test.id(10))),'42501');
reset role;
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(1)::text,false);
create function custom_role_delete_test.fail_receipt() returns trigger language plpgsql as $$begin if new.request_nonce=custom_role_delete_test.id(220) then raise exception 'Synthetic late failure' using errcode='23514';end if;return new;end$$;
create trigger custom_role_delete_test_failure before insert on private.mobile_custom_role_delete_receipts for each row execute function custom_role_delete_test.fail_receipt();
set role authenticated;
select custom_role_delete_test.denied(custom_role_delete_test.request(220,custom_role_delete_test.base(42)),'23514');
reset role;
do $$begin assert exists(select 1 from public.custom_roles where id=custom_role_delete_test.id(42)) and not exists(select 1 from private.mobile_custom_role_delete_receipts where request_nonce=custom_role_delete_test.id(220)),'Late receipt failure did not roll back deletion';end$$;
drop trigger custom_role_delete_test_failure on private.mobile_custom_role_delete_receipts;
set role authenticated;
select custom_role_delete_test.capture('rollback-retry',custom_role_delete_test.request(220,custom_role_delete_test.base(42)));
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(4)::text,false);
select custom_role_delete_test.capture('second-owner-missing',jsonb_set((select request from custom_role_delete_test.cases where name='owner-applied'),'{userId}',to_jsonb(custom_role_delete_test.id(4)))||jsonb_build_object('memberId',custom_role_delete_test.id(11),'requestNonce',custom_role_delete_test.id(221),'base',jsonb_set((select request->'base' from custom_role_delete_test.cases where name='owner-applied'),'{id}',to_jsonb(custom_role_delete_test.id(90)))));
reset role;
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(1)::text,false);
select public.transfer_team_ownership(custom_role_delete_test.team(),custom_role_delete_test.id(11));
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(4)::text,false);
select public.transfer_team_ownership(custom_role_delete_test.team(),(select id from public.team_members where team_id=custom_role_delete_test.team() and profile_id=custom_role_delete_test.id(1)));
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(1)::text,false);
select public.set_team_permission_override(custom_role_delete_test.team(),null,custom_role_delete_test.id(11),'team.manage',true);
set role authenticated;
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(4)::text,false);
select custom_role_delete_test.denied((select request from custom_role_delete_test.cases where name='second-owner-missing'),'42501');
reset role;
select set_config('request.jwt.claim.sub',custom_role_delete_test.id(1)::text,false);
-- Owners' permissions are protected by the existing API; ownership transfer above
-- tests a reachable historical-replay denial without inventing an owner demotion.
set role authenticated;
do $$declare denied boolean:=false;begin begin perform 1 from private.mobile_custom_role_delete_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private ledger readable';end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_custom_role_delete_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Ledger mutable';end$$;
set role anon;
do $$declare denied boolean:=false;begin begin perform public.mobile_apply_custom_role_delete(null,null,'{}');exception when insufficient_privilege then denied:=true;end;assert denied,'Anonymous deletion allowed';end$$;
reset role;
select 'PASS deletion CAS, owner boundaries, assignment preservation, rollback and replay' as result;
