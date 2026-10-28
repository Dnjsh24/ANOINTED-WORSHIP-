\set ON_ERROR_STOP on
-- Synthetic disposable loopback verification only; no hosted execution.
create schema profile_edit_test;
create function profile_edit_test.id(n integer) returns uuid language sql immutable as $$select ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table profile_edit_test.ids(key text primary key,id uuid not null);
create table profile_edit_test.cases(name text primary key,identity jsonb not null,request jsonb not null,receipt jsonb not null);
grant usage on schema profile_edit_test to authenticated;
grant select,insert on profile_edit_test.ids,profile_edit_test.cases to authenticated;
insert into auth.users(id,email) values(profile_edit_test.id(1),'profile-owner-a@example.test'),(profile_edit_test.id(2),'profile-owner-b@example.test'),(profile_edit_test.id(3),'profile-member@example.test'),(profile_edit_test.id(4),'profile-admin@example.test');
select set_config('request.jwt.claim.sub',profile_edit_test.id(1)::text,false);
insert into profile_edit_test.ids select 'team',team_id from public.create_team_workspace('Profile A','PA-61021');
select set_config('request.jwt.claim.sub',profile_edit_test.id(2)::text,false);
insert into profile_edit_test.ids select 'other-team',team_id from public.create_team_workspace('Profile B','PB-61021');
select set_config('request.jwt.claim.sub',profile_edit_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status,ministries,team_anniversary) select profile_edit_test.id(10),id,profile_edit_test.id(3),'member','active',array['Guitar'],'2025-01-01' from profile_edit_test.ids where key='team';
insert into public.team_members(id,team_id,profile_id,role,status) select profile_edit_test.id(11),id,profile_edit_test.id(4),'admin','active' from profile_edit_test.ids where key='team';
select set_config('request.jwt.claim.sub',profile_edit_test.id(2)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status,ministries) select profile_edit_test.id(12),id,profile_edit_test.id(3),'member','active',array['Other team retained'] from profile_edit_test.ids where key='other-team';
update public.profiles set full_name='Original member',birthday='1990-01-01',avatar_url='https://example.test/retained-avatar' where id=profile_edit_test.id(3);
create function profile_edit_test.team() returns uuid language sql stable as $$select id from profile_edit_test.ids where key='team'$$;
create function profile_edit_test.fields() returns jsonb language sql stable as $$select jsonb_build_object('fullName',p.full_name,'birthday',p.birthday,'ministries',coalesce(to_jsonb(m.ministries),'[]'::jsonb),'teamAnniversary',m.team_anniversary)
 from public.profiles p join public.team_members m on m.profile_id=p.id where p.id=auth.uid() and m.team_id=profile_edit_test.team() and m.status='active'$$;
create function profile_edit_test.request(n integer) returns jsonb language sql stable as $$select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',profile_edit_test.team(),
 'memberId',(select id from public.team_members where team_id=profile_edit_test.team() and profile_id=auth.uid() and status='active'),'requestNonce',profile_edit_test.id(n),'base',profile_edit_test.fields(),
 'value',jsonb_build_object('fullName','Updated member','birthday','1991-02-03','ministries',jsonb_build_array('Guitar','Vocals'),'teamAnniversary','2026-01-02'))$$;
create function profile_edit_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_profile_edit((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function profile_edit_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare receipt jsonb;begin receipt:=profile_edit_test.rpc(request);
 insert into profile_edit_test.cases values(label,jsonb_build_object('userId',auth.uid(),'teamId',request->'teamId','memberId',request->'memberId'),request,receipt);return receipt;end$$;
create function profile_edit_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin
 begin perform profile_edit_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected profile rejection '||expected;end$$;
set role authenticated;
select set_config('request.jwt.claim.sub',profile_edit_test.id(3)::text,false);
do $$declare request jsonb;result jsonb;replay jsonb;old_profile jsonb;old_member jsonb;denied boolean:=false;begin
 select to_jsonb(p) into old_profile from public.profiles p where id=auth.uid();select to_jsonb(m) into old_member from public.team_members m where id=profile_edit_test.id(10);
 request:=profile_edit_test.request(100);result:=profile_edit_test.capture('atomic-applied',request);
 assert result->>'status'='applied' and result->'current'=request->'value','Own atomic edit failed';
 assert profile_edit_test.fields()=request->'value','Both own tables did not persist';
 assert (select to_jsonb(p)-array['full_name','birthday','updated_at']=old_profile-array['full_name','birthday','updated_at'] from public.profiles p where id=auth.uid()),'Unowned profile fields changed';
 assert (select to_jsonb(m)-array['ministries','team_anniversary','updated_at']=old_member-array['ministries','team_anniversary','updated_at'] from public.team_members m where id=profile_edit_test.id(10)),'Membership role or other fields changed';
 assert (select ministries=array['Other team retained'] from public.team_members where id=profile_edit_test.id(12)),'Other membership wiped';
 select to_jsonb(p) into old_profile from public.profiles p where id=auth.uid();select to_jsonb(m) into old_member from public.team_members m where id=profile_edit_test.id(10);
 replay:=profile_edit_test.rpc(request);assert replay=result,'Exact lost-reply retry changed immutable receipt';
 assert (select to_jsonb(p)=old_profile from public.profiles p where id=auth.uid()) and (select to_jsonb(m)=old_member from public.team_members m where id=profile_edit_test.id(10)),'Retry repeated profile mutation/timestamps';
 perform profile_edit_test.denied(jsonb_set(request,'{value,fullName}','"Different nonce payload"'),'22023');
 perform profile_edit_test.denied(request||'{"permission":"members.manage"}','22023');
 perform profile_edit_test.denied(jsonb_set(profile_edit_test.request(101),'{value,email}','"changed@example.test"'),'22023');
 perform profile_edit_test.denied(jsonb_set(profile_edit_test.request(102),'{value,birthday}','"2026-02-30"'),'22008');
 perform profile_edit_test.denied(jsonb_set(profile_edit_test.request(103),'{value,ministries}','[null]'),'22023');
 begin perform 1 from private.mobile_profile_edit_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private receipts directly readable';
end$$;
-- An ordinary website edit makes the saved full base stale. Both fields are retained.
select set_config('request.jwt.claim.sub',profile_edit_test.id(3)::text,false);
update public.profiles set full_name='Website change' where id=profile_edit_test.id(3);
set role authenticated;
select set_config('request.jwt.claim.sub',profile_edit_test.id(3)::text,false);
do $$declare old_request jsonb;request jsonb;result jsonb;before_fields jsonb;begin
 select c.request into old_request from profile_edit_test.cases c where name='atomic-applied';
 assert profile_edit_test.rpc(old_request)=(select receipt from profile_edit_test.cases where name='atomic-applied'),'Later edit changed original replay';
 request:=jsonb_set(old_request,'{requestNonce}',to_jsonb(profile_edit_test.id(110)));before_fields:=profile_edit_test.fields();result:=profile_edit_test.capture('stale-base-conflict',request);
 assert result->>'status'='conflict' and result->'current'=before_fields and profile_edit_test.fields()=before_fields,'Conflict overwrote current profile';
 assert profile_edit_test.rpc(request)=result,'Conflict retry changed receipt';
 request:=profile_edit_test.request(111);result:=profile_edit_test.capture('explicit-new-base-applied',request);assert result->>'status'='applied','Explicit resolution failed';
end$$;
reset role;
-- A failure in the second table update must roll back the first table and receipt.
create function profile_edit_test.reject_member_write() returns trigger language plpgsql as $$begin if new.ministries=array['FAIL AT SECOND WRITE'] then raise exception 'Synthetic member failure' using errcode='23514';end if;return new;end$$;
create trigger profile_edit_test_fail before update on public.team_members for each row execute function profile_edit_test.reject_member_write();
select set_config('request.jwt.claim.sub',profile_edit_test.id(3)::text,false);
set role authenticated;
do $$declare request jsonb;before_fields jsonb;begin
 before_fields:=profile_edit_test.fields();request:=profile_edit_test.request(120);request:=jsonb_set(jsonb_set(request,'{value,ministries}','["FAIL AT SECOND WRITE"]'),'{value,fullName}','"Must roll back"');
 perform profile_edit_test.denied(request,'23514');assert profile_edit_test.fields()=before_fields,'Second write failure left partially updated profile';
end$$;
reset role;
drop trigger profile_edit_test_fail on public.team_members;
do $$begin assert not exists(select 1 from private.mobile_profile_edit_receipts where request_nonce=profile_edit_test.id(120)),'Failed atomic edit left a receipt';end$$;
-- Explicit current member-management deny remains enforced by the existing trigger.
select set_config('request.jwt.claim.sub',profile_edit_test.id(1)::text,false);
select public.set_team_permission_override(profile_edit_test.team(),null,profile_edit_test.id(10),'members.manage',false);
set role authenticated;
select set_config('request.jwt.claim.sub',profile_edit_test.id(3)::text,false);
do $$declare request jsonb;before_fields jsonb;begin
 before_fields:=profile_edit_test.fields();request:=profile_edit_test.request(121);request:=jsonb_set(request,'{value,fullName}','"Denied must roll back"');
 perform profile_edit_test.denied(request,'42501');assert profile_edit_test.fields()=before_fields,'Explicit permission deny partially updated profile';
end$$;
reset role;
select set_config('request.jwt.claim.sub',profile_edit_test.id(1)::text,false);
select public.set_team_permission_override(profile_edit_test.team(),null,profile_edit_test.id(10),'members.manage',null);
-- Owner/admin cannot substitute another user's identity or membership.
set role authenticated;
do $$declare request jsonb;begin
 select c.request into request from profile_edit_test.cases c where name='atomic-applied';perform profile_edit_test.denied(request,'42501');
 request:=profile_edit_test.request(130);request:=jsonb_set(request,'{memberId}',to_jsonb(profile_edit_test.id(10)));perform profile_edit_test.denied(request,'42501');end$$;
select set_config('request.jwt.claim.sub',profile_edit_test.id(2)::text,false);
do $$declare request jsonb;begin select c.request into request from profile_edit_test.cases c where name='atomic-applied';perform profile_edit_test.denied(request,'42501');end$$;
-- The same actor cannot reuse a nonce against a different selected team.
select set_config('request.jwt.claim.sub',profile_edit_test.id(3)::text,false);
do $$declare request jsonb;begin
 select c.request into request from profile_edit_test.cases c where name='atomic-applied';
 request:=jsonb_set(jsonb_set(request,'{teamId}',to_jsonb((select id from profile_edit_test.ids where key='other-team'))),'{memberId}',to_jsonb(profile_edit_test.id(12)));
 perform profile_edit_test.denied(request,'22023');end$$;
reset role;
select set_config('request.jwt.claim.sub',profile_edit_test.id(1)::text,false);
update public.team_members set status='inactive' where id=profile_edit_test.id(10);
set role authenticated;
select set_config('request.jwt.claim.sub',profile_edit_test.id(3)::text,false);
do $$declare request jsonb;begin select c.request into request from profile_edit_test.cases c where name='atomic-applied';perform profile_edit_test.denied(request,'42501');end$$;
select set_config('request.jwt.claim.sub','',false);
do $$declare request jsonb;begin select c.request into request from profile_edit_test.cases c where name='atomic-applied';perform profile_edit_test.denied(request,'42501');end$$;
reset role;
-- Administrative SQL cannot rewrite or delete first receipts either.
do $$declare denied boolean:=false;begin
 begin update private.mobile_profile_edit_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Receipt mutation allowed';
 denied:=false;begin delete from private.mobile_profile_edit_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Receipt delete allowed';
 assert (select count(*)=3 from private.mobile_profile_edit_receipts),'Unexpected receipt count';
end$$;
select 'PASS own profile atomic edits, immutable applied/conflict retry receipts, rollback, nonce/team/member/auth and explicit-deny boundaries';
