\set ON_ERROR_STOP on
set timezone='UTC';
create schema self_leave_test;
create function self_leave_test.id(n integer) returns uuid language sql immutable as $$select ('99880000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table self_leave_test.ids(key text primary key,id uuid not null);
create table self_leave_test.cases(name text primary key,scope jsonb not null,request jsonb not null,receipt jsonb not null);
create table self_leave_test.states(name text primary key,scope jsonb not null,state jsonb not null);
create table self_leave_test.pending(key text primary key,request jsonb not null);
grant usage on schema self_leave_test to authenticated;
grant select,insert on all tables in schema self_leave_test to authenticated;
insert into auth.users(id,email) select self_leave_test.id(n),'self-leave-'||n||'@example.test' from generate_series(1,9) n;
select set_config('request.jwt.claim.sub',self_leave_test.id(1)::text,false);
insert into self_leave_test.ids select 'team',team_id from public.create_team_workspace('Self leave A','SLA-81023');
select set_config('request.jwt.claim.sub',self_leave_test.id(2)::text,false);
insert into self_leave_test.ids select 'other',team_id from public.create_team_workspace('Self leave B','SLB-81023');
create function self_leave_test.team() returns uuid language sql stable as $$select id from self_leave_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',self_leave_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status,created_at,ministry)
select self_leave_test.id(n+7),self_leave_test.team(),self_leave_test.id(n),'member','active','2026-10-23T03:04:05.123456Z','Self leave fixture' from generate_series(3,8) n;
insert into public.team_members(id,team_id,profile_id,role,status) values(self_leave_test.id(99),(select id from self_leave_test.ids where key='other'),self_leave_test.id(3),'member','active');
insert into public.message_channels(id,team_id,name,created_by) values(self_leave_test.id(80),self_leave_test.team(),'Self leave fixture',self_leave_test.id(1));
insert into public.message_channel_members(channel_id,team_member_id) select self_leave_test.id(80),self_leave_test.id(n) from generate_series(10,12) n;
insert into public.messages(id,channel_id,sender_member_id,body) values(self_leave_test.id(81),self_leave_test.id(80),self_leave_test.id(11),'Protected self departure message');
select public.set_team_permission_override(self_leave_test.team(),null,self_leave_test.id(10),'songs.edit',false);
select public.set_team_permission_override(self_leave_test.team(),null,self_leave_test.id(11),'songs.edit',false);
select public.set_team_permission_override(self_leave_test.team(),null,self_leave_test.id(12),'songs.edit',false);
create function self_leave_test.scope(request jsonb) returns jsonb language sql immutable as $$select jsonb_build_object('userId',request->'userId','teamId',request->'teamId','memberId',request->'memberId')$$;
create function self_leave_test.request(n integer) returns jsonb language sql stable security definer set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',m.team_id,'memberId',m.id,'requestNonce',self_leave_test.id(n),'confirmation','LEAVE TEAM',
 'base',jsonb_build_object('ownerId',t.owner_id,'member',private.mobile_member_role_snapshot(m))) from public.team_members m join public.teams t on t.id=m.team_id
 where m.team_id=self_leave_test.team() and m.profile_id=auth.uid();
$$;
create function self_leave_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_self_member_leave((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function self_leave_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=self_leave_test.rpc(request);insert into self_leave_test.cases values(label,self_leave_test.scope(request),request,result);return result;end$$;
create function self_leave_test.state(label text,request jsonb,nonce boolean default false) returns jsonb language plpgsql as $$declare result jsonb;begin result:=public.mobile_read_self_member_leave_state((request->>'teamId')::uuid,(request->>'memberId')::uuid,case when nonce then (request->>'requestNonce')::uuid else null end);insert into self_leave_test.states values(label,self_leave_test.scope(request),result);return result;end$$;
create function self_leave_test.denied(request jsonb,expected text default '42501') returns void language plpgsql as $$declare denied boolean:=false;begin begin perform self_leave_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected self-leave denial '||expected;end$$;
create function self_leave_test.denied_state(request jsonb,nonce boolean default true) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform public.mobile_read_self_member_leave_state((request->>'teamId')::uuid,(request->>'memberId')::uuid,case when nonce then (request->>'requestNonce')::uuid else null end);exception when insufficient_privilege then denied:=true;end;assert denied,'Expected self-leave state denial';end$$;
create function self_leave_test.related(n integer) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('member',(select to_jsonb(m) from public.team_members m where id=self_leave_test.id(n)),
 'overrides',(select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o where member_id=self_leave_test.id(n)),
 'channelMembers',(select jsonb_agg(to_jsonb(c) order by id) from public.message_channel_members c where team_member_id=self_leave_test.id(n)));
$$;
create table self_leave_test.related_before as select n,self_leave_test.related(n) value from generate_series(10,12) n;
create table self_leave_test.preserved as select 'profile' key,to_jsonb(p) value from public.profiles p where id=self_leave_test.id(3)
union all select 'account',to_jsonb(u) from auth.users u where id=self_leave_test.id(3)
union all select 'other-membership',to_jsonb(m) from public.team_members m where id=self_leave_test.id(99);
select set_config('request.jwt.claim.sub',self_leave_test.id(3)::text,false);
set role authenticated;
insert into self_leave_test.pending values('applied',self_leave_test.request(200));
select self_leave_test.state('precise-active',self_leave_test.request(200));
select self_leave_test.denied(self_leave_test.request(200)||'{"unexpected":true}','22023');
select self_leave_test.denied(jsonb_set(self_leave_test.request(200),'{confirmation}','"leave team"'),'22023');
select self_leave_test.denied(jsonb_set(self_leave_test.request(200),'{userId}',to_jsonb(self_leave_test.id(4))));
select self_leave_test.denied(jsonb_set(self_leave_test.request(200),'{memberId}',to_jsonb(self_leave_test.id(11))));
select self_leave_test.denied(jsonb_set(self_leave_test.request(200),'{base,member,createdAt}','"2026-10-23T03:04:05.123457Z"'));
select self_leave_test.capture('applied-no-management-permission',self_leave_test.request(200));
do $$declare req jsonb:=(select request from self_leave_test.pending where key='applied');begin
 assert self_leave_test.rpc(req)=(select receipt from self_leave_test.cases where name='applied-no-management-permission'),'Applied exact replay changed';
 perform self_leave_test.denied(jsonb_set(req,'{requestNonce}',to_jsonb(self_leave_test.id(201))));
 perform self_leave_test.denied(jsonb_set(req,'{base,member,role}','"media"'),'22023');
 perform self_leave_test.denied_state(req,false);
end$$;
select self_leave_test.state('sealed-departure',(select request from self_leave_test.pending where key='applied'),true);
reset role;
do $$begin
 assert not exists(select 1 from public.team_members where id=self_leave_test.id(10)) and not exists(select 1 from public.team_permission_overrides where member_id=self_leave_test.id(10)) and not exists(select 1 from public.message_channel_members where team_member_id=self_leave_test.id(10)),'Departure cascade not applied';
 assert (select value from self_leave_test.preserved where key='profile')=(select to_jsonb(p) from public.profiles p where id=self_leave_test.id(3)) and (select value from self_leave_test.preserved where key='account')=(select to_jsonb(u) from auth.users u where id=self_leave_test.id(3)) and (select value from self_leave_test.preserved where key='other-membership')=(select to_jsonb(m) from public.team_members m where id=self_leave_test.id(99)),'Departure affected global account or other team';
end$$;
select set_config('request.jwt.claim.sub',self_leave_test.id(4)::text,false);
set role authenticated;
select self_leave_test.capture('blocked-message-restrict',self_leave_test.request(210));
select self_leave_test.state('protected-active',self_leave_test.request(210));
reset role;
do $$begin assert self_leave_test.related(11)=(select value from self_leave_test.related_before where n=11),'Blocked deletion partially cascaded';end$$;
delete from public.messages where id=self_leave_test.id(81);
select set_config('request.jwt.claim.sub',self_leave_test.id(4)::text,false);
set role authenticated;
do $$declare saved record;begin select * into saved from self_leave_test.cases where name='blocked-message-restrict';assert self_leave_test.rpc(saved.request)=saved.receipt,'Blocked history changed after constraint resolution';end$$;
reset role;
create function self_leave_test.fail_late() returns trigger language plpgsql as $$begin if new.request_nonce=self_leave_test.id(220) then raise exception 'Synthetic late ledger failure';end if;return new;end$$;
create trigger self_leave_fail_late before insert on private.mobile_self_member_leave_receipts for each row execute function self_leave_test.fail_late();
select set_config('request.jwt.claim.sub',self_leave_test.id(5)::text,false);
set role authenticated;
select self_leave_test.denied(self_leave_test.request(220),'P0001');
reset role;
do $$begin assert self_leave_test.related(12)=(select value from self_leave_test.related_before where n=12),'Ledger failure did not restore all deletion effects';end$$;
drop trigger self_leave_fail_late on private.mobile_self_member_leave_receipts;
select set_config('request.jwt.claim.sub',self_leave_test.id(6)::text,false);
set role authenticated;
select self_leave_test.capture('role-conflict',jsonb_set(self_leave_test.request(230),'{base,member,role}','"media"'));
select self_leave_test.capture('owner-base-conflict',jsonb_set(self_leave_test.request(231),'{base,ownerId}',to_jsonb(self_leave_test.id(2))));
select self_leave_test.denied_state((select request from self_leave_test.pending where key='applied'));
reset role;
select set_config('request.jwt.claim.sub',self_leave_test.id(1)::text,false);
set role authenticated;
select self_leave_test.denied(self_leave_test.request(240));
reset role;
-- New membership, including inactive replacement, prevents old history recovery.
insert into public.team_members(id,team_id,profile_id,role,status) values(self_leave_test.id(90),self_leave_test.team(),self_leave_test.id(3),'member','inactive');
select set_config('request.jwt.claim.sub',self_leave_test.id(3)::text,false);
set role authenticated;
select self_leave_test.denied((select request from self_leave_test.pending where key='applied'));
select self_leave_test.denied_state((select request from self_leave_test.pending where key='applied'));
reset role;
delete from public.team_members where id=self_leave_test.id(90);
insert into public.team_members(id,team_id,profile_id,role,status,created_at) values(self_leave_test.id(10),self_leave_test.team(),self_leave_test.id(3),'member','active','2026-10-24T00:00:00Z');
select set_config('request.jwt.claim.sub',self_leave_test.id(3)::text,false);
set role authenticated;
select self_leave_test.denied((select request from self_leave_test.pending where key='applied'));
select self_leave_test.denied_state((select request from self_leave_test.pending where key='applied'));
reset role;
do $$declare blocked boolean:=false;begin begin update private.mobile_self_member_leave_receipts set recorded_at=clock_timestamp();exception when others then blocked:=true;end;assert blocked,'Ledger mutable';end$$;
set role authenticated;
do $$declare blocked boolean:=false;begin begin perform 1 from private.mobile_self_member_leave_receipts;exception when insufficient_privilege then blocked:=true;end;assert blocked,'Private ledger exposed';end$$;
reset role;
set role anon;
do $$declare blocked boolean:=false;begin begin perform public.mobile_read_self_member_leave_state(null,null,null);exception when insufficient_privilege then blocked:=true;end;assert blocked,'Anonymous state allowed';end$$;
reset role;
select set_config('request.jwt.claim.sub',self_leave_test.id(7)::text,false);
insert into self_leave_test.pending values('role-race',self_leave_test.request(300));
select set_config('request.jwt.claim.sub',self_leave_test.id(8)::text,false);
insert into self_leave_test.pending values('owner-race',self_leave_test.request(301));
