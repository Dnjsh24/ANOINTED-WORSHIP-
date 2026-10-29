\set ON_ERROR_STOP on
set timezone='UTC';
-- Disposable synthetic loopback data only, never hosted data.
create schema member_invitation_test;
create function member_invitation_test.id(n integer) returns uuid language sql immutable as $$select ('99100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table member_invitation_test.ids(key text primary key,id uuid not null);
create table member_invitation_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
grant usage on schema member_invitation_test to authenticated;
grant select,insert on member_invitation_test.ids,member_invitation_test.cases to authenticated;
insert into auth.users(id,email) select member_invitation_test.id(n),'invitation-'||n||'@example.test' from generate_series(1,8) n;
select set_config('request.jwt.claim.sub',member_invitation_test.id(1)::text,false);
insert into member_invitation_test.ids select 'team',team_id from public.create_team_workspace('Invitation A','IA-61022');
select set_config('request.jwt.claim.sub',member_invitation_test.id(2)::text,false);
insert into member_invitation_test.ids select 'other',team_id from public.create_team_workspace('Invitation B','IB-61022');
create function member_invitation_test.team() returns uuid language sql stable as $$select id from member_invitation_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',member_invitation_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status,ministry,ministries,team_anniversary) values
 (member_invitation_test.id(10),member_invitation_test.team(),member_invitation_test.id(3),'member','active','Delegate',array['Preserved'],'2025-01-01'),
 (member_invitation_test.id(11),member_invitation_test.team(),member_invitation_test.id(4),'admin','active','Admin',array['Retained'],'2025-01-01'),
 (member_invitation_test.id(12),member_invitation_test.team(),member_invitation_test.id(5),'pastor','active','Existing',array['Pastor'],'2025-01-01'),
 (member_invitation_test.id(13),member_invitation_test.team(),member_invitation_test.id(6),'admin','inactive','Existing inactive',array['Protected'],'2025-01-01');
insert into public.team_invitations(id,team_id,email,role,message,invited_by,status) values
 (member_invitation_test.id(30),member_invitation_test.team(),'Existing@Example.test','pastor','Prior invitation',member_invitation_test.id(1),'pending'),
 (member_invitation_test.id(31),member_invitation_test.team(),'accepted@example.test','member','Accepted',member_invitation_test.id(1),'accepted'),
 (member_invitation_test.id(32),member_invitation_test.team(),'revoked@example.test','member','Revoked',member_invitation_test.id(1),'revoked');
-- Model untouched legacy case-only duplicates; the migration never cleans these up.
alter table public.team_invitations disable trigger member_invitation_email_guard;
insert into public.team_invitations(id,team_id,email,role,message,invited_by,status) values
 (member_invitation_test.id(33),member_invitation_test.team(),'LEGACY@example.test','pastor','Legacy A',member_invitation_test.id(1),'pending'),
 (member_invitation_test.id(34),member_invitation_test.team(),'legacy@example.test','member','Legacy B',member_invitation_test.id(1),'revoked');
alter table public.team_invitations enable trigger member_invitation_email_guard;
create table member_invitation_test.members_before as select jsonb_agg(to_jsonb(m) order by id) value from public.team_members m;
create function member_invitation_test.request(n integer,email text,role text default 'member',message text default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',member_invitation_test.team(),'memberId',(select id from public.team_members where team_id=member_invitation_test.team() and profile_id=auth.uid() and status='active'),
 'requestNonce',member_invitation_test.id(n),'email',email,'role',role,'message',message)
$$;
create function member_invitation_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_member_invitation((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function member_invitation_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=member_invitation_test.rpc(request);insert into member_invitation_test.cases values(label,request,result);return result;end$$;
create function member_invitation_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform member_invitation_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected invitation denial '||expected;end$$;
set role authenticated;
do $$declare req jsonb;result jsonb;before jsonb;address text;counter integer:=210;begin
 req:=member_invitation_test.request(200,'new@example.test','pastor','Join this team.');result:=member_invitation_test.capture('created-pending',req);
 assert result->>'status'='applied' and result#>>'{current,status}'='pending' and result#>'{current,expiresAt}'='null'::jsonb,'No exact saved pending invitation';
 select to_jsonb(i) into before from public.team_invitations i where id=(result#>>'{current,id}')::uuid;
 assert member_invitation_test.rpc(req)=result and before=(select to_jsonb(i) from public.team_invitations i where id=(result#>>'{current,id}')::uuid),'Lost reply repeated invitation timestamps or changed receipt';
 perform member_invitation_test.denied(jsonb_set(req,'{message}','"Changed message"'),'22023');
 perform member_invitation_test.denied(jsonb_set(req,'{email}','"other@example.test"'),'22023');
 perform member_invitation_test.denied(jsonb_set(req,'{role}','"member"'),'22023');
 perform member_invitation_test.denied(jsonb_set(req,'{userId}',to_jsonb(member_invitation_test.id(2))),'42501');
 perform member_invitation_test.denied(jsonb_set(req,'{memberId}',to_jsonb(member_invitation_test.id(11))),'42501');
 perform member_invitation_test.denied(req||'{"expiresAt":"2030-01-01"}','22023');
 perform member_invitation_test.denied(member_invitation_test.request(201,'UPPER@example.test'),'22023');
 perform member_invitation_test.denied(member_invitation_test.request(202,'.bad@example.test'),'22023');
 perform member_invitation_test.denied(member_invitation_test.request(203,'two..dots@example.test'),'22023');
 perform member_invitation_test.denied(member_invitation_test.request(204,'other@example.test','member',repeat('x',1001)),'22023');
 foreach address in array array['existing@example.test','accepted@example.test','revoked@example.test','legacy@example.test','new@example.test'] loop
  select jsonb_agg(to_jsonb(i) order by id) into before from public.team_invitations i where team_id=member_invitation_test.team() and lower(btrim(email))=address;
  result:=member_invitation_test.capture('duplicate-'||address,member_invitation_test.request(counter,address));counter:=counter+1;
  assert result->>'status'='blocked' and result->>'reason'='existing_invitation' and result->'current'='null'::jsonb,'Existing invitation not blocked safely';
  assert before=(select jsonb_agg(to_jsonb(i) order by id) from public.team_invitations i where team_id=member_invitation_test.team() and lower(btrim(email))=address),'Existing invitation overwritten';
 end loop;
 result:=member_invitation_test.capture('active-membership-blocked',member_invitation_test.request(220,'invitation-5@example.test'));assert result->>'reason'='existing_membership','Active membership not blocked';
 result:=member_invitation_test.capture('inactive-membership-blocked',member_invitation_test.request(221,'invitation-6@example.test'));assert result->>'reason'='existing_membership','Inactive privileged membership not blocked';
 result:=member_invitation_test.capture('owner-role-blocked',member_invitation_test.request(222,'owner-invite@example.test','owner'));assert result->>'reason'='privileged_role','Owner invitation allowed';
 result:=member_invitation_test.capture('admin-role-blocked',member_invitation_test.request(223,'admin-invite@example.test','admin'));assert result->>'reason'='privileged_role','Admin invitation allowed';
 result:=member_invitation_test.capture('maximum-message',member_invitation_test.request(224,'max@example.test','member',repeat('あ',1000)));assert result->>'status'='applied','Maximum website message rejected';
end$$;
reset role;
do $$begin assert (select value from member_invitation_test.members_before)=(select jsonb_agg(to_jsonb(m) order by id) from public.team_members m),'Invitation created or changed membership';end$$;
-- Existing website inserts also serialize casefold email keys and cannot duplicate.
set role authenticated;
do $$declare denied boolean:=false;begin begin insert into public.team_invitations(team_id,email,role,invited_by) values(member_invitation_test.team(),'EXISTING@example.test','member',auth.uid());exception when unique_violation then denied:=true;end;assert denied,'Website casefold duplicate bypassed guard';end$$;
select set_config('request.jwt.claim.sub',member_invitation_test.id(3)::text,false);
select member_invitation_test.denied(member_invitation_test.request(230,'denied@example.test'),'42501');
reset role;
select set_config('request.jwt.claim.sub',member_invitation_test.id(1)::text,false);
select public.set_team_permission_override(member_invitation_test.team(),null,member_invitation_test.id(10),'members.manage',true);
set role authenticated;
select set_config('request.jwt.claim.sub',member_invitation_test.id(3)::text,false);
select member_invitation_test.capture('delegated-member-created',member_invitation_test.request(231,'delegated@example.test'));
select member_invitation_test.denied(member_invitation_test.request(232,'delegated-role@example.test','pastor'),'42501');
reset role;
-- A receipt insertion failure rolls the invitation back too; retry retains exact nonce.
create function member_invitation_test.fail_receipt() returns trigger language plpgsql as $$begin if new.request->>'email'='rollback@example.test' then raise exception 'Synthetic ledger failure' using errcode='23514';end if;return new;end$$;
create trigger member_invitation_test_failure before insert on private.mobile_member_invitation_receipts for each row execute function member_invitation_test.fail_receipt();
select set_config('request.jwt.claim.sub',member_invitation_test.id(1)::text,false);
set role authenticated;
select member_invitation_test.denied(member_invitation_test.request(240,'rollback@example.test'),'23514');
reset role;
do $$begin assert not exists(select 1 from public.team_invitations where email='rollback@example.test') and not exists(select 1 from private.mobile_member_invitation_receipts where request_nonce=member_invitation_test.id(240)),'Late failure left partial invitation or receipt';end$$;
drop trigger member_invitation_test_failure on private.mobile_member_invitation_receipts;
set role authenticated;
select member_invitation_test.capture('rollback-exact-retry',member_invitation_test.request(240,'rollback@example.test'));
select set_config('request.jwt.claim.sub',member_invitation_test.id(4)::text,false);
select member_invitation_test.capture('admin-role-created',member_invitation_test.request(241,'admin-authority@example.test','band_member'));
reset role;
select set_config('request.jwt.claim.sub',member_invitation_test.id(1)::text,false);
select public.set_team_permission_override(member_invitation_test.team(),null,member_invitation_test.id(11),'members.manage',true);
update public.team_members set role='member' where id=member_invitation_test.id(11);
select public.set_team_permission_override(member_invitation_test.team(),null,member_invitation_test.id(10),'members.manage',false);
set role authenticated;
select set_config('request.jwt.claim.sub',member_invitation_test.id(4)::text,false);
select member_invitation_test.denied((select request from member_invitation_test.cases where name='admin-role-created'),'42501');
select set_config('request.jwt.claim.sub',member_invitation_test.id(3)::text,false);
select member_invitation_test.denied((select request from member_invitation_test.cases where name='delegated-member-created'),'42501');
reset role;
select set_config('request.jwt.claim.sub',member_invitation_test.id(1)::text,false);
-- Historical replay is a historical receipt, never resurrection or a fresh invitation.
delete from public.team_invitations where email='new@example.test';
set role authenticated;
do $$declare req jsonb;denied boolean:=false;begin
 select request into req from member_invitation_test.cases where name='created-pending';assert member_invitation_test.rpc(req)=(select receipt from member_invitation_test.cases where name='created-pending'),'Historical receipt changed';
 assert not exists(select 1 from public.team_invitations where email='new@example.test'),'Deleted invitation revived';
 begin perform 1 from private.mobile_member_invitation_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private invitation ledger readable';
end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_member_invitation_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Immutable invitation receipt edited';end$$;
select 'PASS invitation exact retries, no membership grants, preserved duplicates, both role boundaries, current authority, rollback and non-revival' as result;
