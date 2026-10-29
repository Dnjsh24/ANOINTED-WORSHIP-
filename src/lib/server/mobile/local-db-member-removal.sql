\set ON_ERROR_STOP on
set timezone='UTC';
-- Synthetic disposable loopback fixtures only.
create schema member_removal_test;
create function member_removal_test.id(n integer) returns uuid language sql immutable as $$select ('99820000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table member_removal_test.ids(key text primary key,id uuid not null);
create table member_removal_test.cases(name text primary key,identity jsonb not null,request jsonb not null,receipt jsonb not null);
create table member_removal_test.states(name text primary key,identity jsonb not null,state jsonb not null);
grant usage on schema member_removal_test to authenticated;
grant select,insert on member_removal_test.ids,member_removal_test.cases,member_removal_test.states to authenticated;
insert into auth.users(id,email) select member_removal_test.id(n),'removal-'||n||'@example.test' from generate_series(1,14) n;
select set_config('request.jwt.claim.sub',member_removal_test.id(1)::text,false);
insert into member_removal_test.ids select 'team',team_id from public.create_team_workspace('Removals A','MRA-72023');
select set_config('request.jwt.claim.sub',member_removal_test.id(2)::text,false);
insert into member_removal_test.ids select 'other',team_id from public.create_team_workspace('Removals B','MRB-72023');
create function member_removal_test.team() returns uuid language sql stable as $$select id from member_removal_test.ids where key='team'$$;
select set_config('request.jwt.claim.sub',member_removal_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status,ministry,created_at) values
 (member_removal_test.id(10),member_removal_test.team(),member_removal_test.id(3),'admin','active','Admin','2026-10-23T02:00:00Z'),
 (member_removal_test.id(11),member_removal_test.team(),member_removal_test.id(4),'owner','active','Owner','2026-10-23T02:00:00Z'),
 (member_removal_test.id(12),member_removal_test.team(),member_removal_test.id(5),'member','active','Delegate','2026-10-23T02:00:00Z'),
 (member_removal_test.id(20),member_removal_test.team(),member_removal_test.id(6),'member','active','Precise','2026-10-23T03:04:05.123456Z'),
 (member_removal_test.id(21),member_removal_test.team(),member_removal_test.id(7),'member','inactive','Inactive','2026-10-23T03:00:00Z'),
 (member_removal_test.id(22),member_removal_test.team(),member_removal_test.id(8),'member','active','CAS','2026-10-23T03:00:00Z'),
 (member_removal_test.id(23),member_removal_test.team(),member_removal_test.id(9),'member','active','Replay','2026-10-23T03:00:00Z'),
 (member_removal_test.id(24),member_removal_test.team(),member_removal_test.id(10),'member','active','Rollback','2026-10-23T03:00:00Z'),
 (member_removal_test.id(25),member_removal_test.team(),member_removal_test.id(11),'member','active','Website race','2026-10-23T03:00:00Z'),
 (member_removal_test.id(26),member_removal_test.team(),member_removal_test.id(12),'member','active','Custom edit race','2026-10-23T03:00:00Z'),
 (member_removal_test.id(27),member_removal_test.team(),member_removal_test.id(13),'member','active','Target delete race','2026-10-23T03:00:00Z'),
 (member_removal_test.id(28),member_removal_test.team(),member_removal_test.id(14),'member','active','Custom delete race','2026-10-23T03:00:00Z');
insert into public.custom_roles(id,team_id,name,permissions,created_at) values
 (member_removal_test.id(30),member_removal_test.team(),'',array['team.manage','events.manage'],'2026-10-23T03:04:05.123456Z'),
 (member_removal_test.id(31),member_removal_test.team(),'Missing role',array[]::text[],null),
 (member_removal_test.id(32),member_removal_test.team(),'Changed role',array['songs.create'],null),
 (member_removal_test.id(33),member_removal_test.team(),'Race edit role',array['events.manage'],null),
 (member_removal_test.id(34),member_removal_test.team(),'Race delete role',array['events.manage'],null);
select set_config('request.jwt.claim.sub',member_removal_test.id(2)::text,false);
insert into public.custom_roles(id,team_id,name,permissions) values(member_removal_test.id(35),(select id from member_removal_test.ids where key='other'),'Foreign role',array[]::text[]);
select set_config('request.jwt.claim.sub',member_removal_test.id(1)::text,false);
select public.set_team_permission_override(member_removal_test.team(),null,member_removal_test.id(20),'songs.edit',false);
select public.set_team_permission_override(member_removal_test.team(),null,member_removal_test.id(12),'members.manage',true);
create table member_removal_test.overrides_before as select jsonb_agg(to_jsonb(o) order by id) value from public.team_permission_overrides o;
create function member_removal_test.identity() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',auth.uid(),'teamId',m.team_id,'memberId',m.id,'teamName',t.name,'role',m.role,'permissions',jsonb_build_array('members.manage'))
 from public.team_members m join public.teams t on t.id=m.team_id where m.team_id=member_removal_test.team() and m.profile_id=auth.uid() and m.status='active'
$$;
create function member_removal_test.base(n integer) returns jsonb language sql stable security definer set search_path='' as $$select private.mobile_member_role_snapshot(m) from public.team_members m where id=member_removal_test.id(n)$$;
create function member_removal_test.custom(n integer) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('id',id,'teamId',team_id,'name',name,'permissions',permissions,'createdAt',created_at) from public.custom_roles where id=member_removal_test.id(n)$$;
create function member_removal_test.request(n integer,target integer) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',member_removal_test.team(),'memberId',(select id from public.team_members where team_id=member_removal_test.team() and profile_id=auth.uid() and status='active'),'requestNonce',member_removal_test.id(n),'base',member_removal_test.base(target))
$$;
create function member_removal_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_member_removal((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function member_removal_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=member_removal_test.rpc(request);insert into member_removal_test.cases values(label,member_removal_test.identity(),request,result);return result;end$$;
create function member_removal_test.capture_state(label text,target uuid) returns jsonb language plpgsql as $$declare result jsonb;begin result:=public.mobile_read_member_role_state(member_removal_test.team(),(member_removal_test.identity()->>'memberId')::uuid,target);insert into member_removal_test.states values(label,member_removal_test.identity(),result);return result;end$$;
create function member_removal_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform member_removal_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected removal denial '||expected;end$$;

select set_config('request.jwt.claim.sub',member_removal_test.id(2)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status) values(member_removal_test.id(99),(select id from member_removal_test.ids where key='other'),member_removal_test.id(6),'member','active');
select set_config('request.jwt.claim.sub',member_removal_test.id(1)::text,false);
update public.team_members set custom_role_id=member_removal_test.id(30) where id=member_removal_test.id(22);
select public.set_team_permission_override(member_removal_test.team(),null,member_removal_test.id(23),'songs.edit',false);
select public.set_team_permission_override(member_removal_test.team(),null,member_removal_test.id(24),'songs.edit',false);
insert into public.message_channels(id,team_id,name,created_by) values(member_removal_test.id(80),member_removal_test.team(),'Removal fixture channel',member_removal_test.id(1));
insert into public.message_channel_members(channel_id,team_member_id) select member_removal_test.id(80),member_removal_test.id(n) from unnest(array[20,23,24]) n;
insert into public.messages(id,channel_id,sender_member_id,body) values(member_removal_test.id(81),member_removal_test.id(80),member_removal_test.id(23),'Protected removal fixture message');
insert into public.member_usage_state(member_id,team_id,last_seen_at,last_credited_minute) select member_removal_test.id(n),member_removal_test.team(),'2026-10-23T03:00:00Z','2026-10-23T03:00:00Z' from unnest(array[20,23,24]) n;
insert into public.member_usage_daily(member_id,team_id,usage_date,active_minutes,sessions) select member_removal_test.id(n),member_removal_test.team(),'2026-10-23',10,1 from unnest(array[20,23,24]) n;
insert into public.setlists(id,team_id,name,setlist_date,leader_member_id,created_by) select member_removal_test.id(n+50),member_removal_test.team(),'Removal leader fixture '||n,'2026-10-23',member_removal_test.id(n),member_removal_test.id(1) from unnest(array[20,23,24]) n;
create table member_removal_test.preserved as
 select 'profile' key,to_jsonb(p) value from public.profiles p where id=member_removal_test.id(6)
 union all select 'account',to_jsonb(u) from auth.users u where id=member_removal_test.id(6)
 union all select 'team',to_jsonb(t) from public.teams t where id=member_removal_test.team()
 union all select 'other-membership',to_jsonb(m) from public.team_members m where id=member_removal_test.id(99);
create function member_removal_test.related(n integer) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('member',(select to_jsonb(m) from public.team_members m where id=member_removal_test.id(n)),
 'overrides',(select jsonb_agg(to_jsonb(o) order by id) from public.team_permission_overrides o where member_id=member_removal_test.id(n)),
 'usageState',(select to_jsonb(u) from public.member_usage_state u where member_id=member_removal_test.id(n)),
 'usageDaily',(select jsonb_agg(to_jsonb(d) order by usage_date) from public.member_usage_daily d where member_id=member_removal_test.id(n)),
 'channelMembers',(select jsonb_agg(to_jsonb(c) order by id) from public.message_channel_members c where team_member_id=member_removal_test.id(n)),
 'setlist',(select to_jsonb(s) from public.setlists s where id=member_removal_test.id(n+50)))
$$;
create table member_removal_test.related_before as select n,member_removal_test.related(n) value from unnest(array[20,23,24]) n;
create table member_removal_test.other_members_before as select jsonb_agg(to_jsonb(m) order by id) value from public.team_members m where id not in (member_removal_test.id(20),member_removal_test.id(21));
set role authenticated;
select member_removal_test.capture_state('precise-target',member_removal_test.id(20));
select member_removal_test.capture_state('inactive-target',member_removal_test.id(21));
select member_removal_test.capture_state('restricted-target',member_removal_test.id(23));
select member_removal_test.capture_state('owner-self',(member_removal_test.identity()->>'memberId')::uuid);
select member_removal_test.capture_state('missing-target',member_removal_test.id(90));
do $$declare req jsonb;result jsonb;begin
 req:=member_removal_test.request(200,20);result:=member_removal_test.capture('owner-applied-with-cascades',req);
 assert result->>'status'='applied' and result->'current'='null'::jsonb,'Member not removed';
 assert member_removal_test.rpc(req)=result,'Exact retry changed receipt';
 perform member_removal_test.denied(jsonb_set(req,'{base,status}','"inactive"'),'22023');
 result:=member_removal_test.capture('already-missing',jsonb_set(req,'{requestNonce}',to_jsonb(member_removal_test.id(201))));assert result->>'status'='missing','Missing member not reported';
 result:=member_removal_test.capture('inactive-applied',member_removal_test.request(202,21));assert result->>'status'='applied','Inactive target not removed';
 req:=member_removal_test.request(210,22);
 result:=member_removal_test.capture('role-conflict',jsonb_set(req,'{base,role}','"media"'));assert result->>'status'='conflict','Changed role removed';
 result:=member_removal_test.capture('status-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(member_removal_test.id(211))),'{base,status}','"inactive"'));assert result->>'status'='conflict','Changed status removed';
 result:=member_removal_test.capture('profile-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(member_removal_test.id(212))),'{base,profileId}',to_jsonb(member_removal_test.id(2))));assert result->>'status'='conflict','Changed profile removed';
 result:=member_removal_test.capture('timestamp-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(member_removal_test.id(213))),'{base,createdAt}','"2026-10-23T03:00:00.000001Z"'));assert result->>'status'='conflict','Changed timestamp removed';
 result:=member_removal_test.capture('custom-id-conflict',jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(member_removal_test.id(214))),'{base,customRoleId}','null'));assert result->>'status'='conflict','Changed custom role removed';
 perform member_removal_test.denied(jsonb_set(req,'{userId}',to_jsonb(member_removal_test.id(2))),'42501');
 perform member_removal_test.denied(jsonb_set(req,'{memberId}',to_jsonb(member_removal_test.id(10))),'42501');
 perform member_removal_test.denied(jsonb_set(req,'{base,teamId}',to_jsonb(member_removal_test.id(90))),'42501');
 perform member_removal_test.denied(req||'{"unexpected":true}','22023');
 perform member_removal_test.denied(req||'{"value":{}}','22023');
 perform member_removal_test.denied(member_removal_test.request(215,11),'42501');
 perform member_removal_test.denied(jsonb_set(member_removal_test.request(216,11),'{base,role}','"member"'),'42501');
 perform member_removal_test.denied(jsonb_set(req,'{base,id}',member_removal_test.identity()->'memberId'),'42501');
 perform member_removal_test.denied(jsonb_set(req,'{base,profileId}',member_removal_test.identity()->'userId'),'42501');
 result:=member_removal_test.capture('foreign-target-hidden',jsonb_set(member_removal_test.request(217,99),'{base,teamId}',to_jsonb(member_removal_test.team())));assert result->>'status'='missing','Foreign membership leaked or removed';
end$$;
select member_removal_test.capture_state('removed-target-fresh-state',member_removal_test.id(20));
reset role;
do $$begin
 assert not exists(select 1 from public.team_members where id in (member_removal_test.id(20),member_removal_test.id(21))),'Membership remained';
 assert not exists(select 1 from public.team_permission_overrides where member_id=member_removal_test.id(20)) and not exists(select 1 from public.member_usage_state where member_id=member_removal_test.id(20)) and not exists(select 1 from public.member_usage_daily where member_id=member_removal_test.id(20)) and not exists(select 1 from public.message_channel_members where team_member_id=member_removal_test.id(20)),'Expected FK cascades did not run';
 assert exists(select 1 from public.setlists where id=member_removal_test.id(70) and leader_member_id is null),'Expected leader SET NULL did not run';
 assert (select value from member_removal_test.preserved where key='profile')=(select to_jsonb(p) from public.profiles p where id=member_removal_test.id(6)) and (select value from member_removal_test.preserved where key='account')=(select to_jsonb(u) from auth.users u where id=member_removal_test.id(6)),'Profile or global account changed';
 assert exists(select 1 from public.profiles where id=member_removal_test.id(7)),'Inactive target profile removed';
 assert (select value from member_removal_test.preserved where key='team')=(select to_jsonb(t) from public.teams t where id=member_removal_test.team()) and (select value from member_removal_test.preserved where key='other-membership')=(select to_jsonb(m) from public.team_members m where id=member_removal_test.id(99)),'Team or other-team membership changed';
 assert (select value from member_removal_test.other_members_before)=(select jsonb_agg(to_jsonb(m) order by id) from public.team_members m where id not in (member_removal_test.id(20),member_removal_test.id(21))),'Another membership changed';
end$$;
set role authenticated;
do $$declare req jsonb;result jsonb;begin
 req:=member_removal_test.request(220,23);result:=member_removal_test.capture('related-records-blocked',req);
 assert result->>'status'='blocked' and result->>'reason'='related_records' and result->'current'=req->'base','Protected message reference not blocked durably';
 assert member_removal_test.rpc(req)=result,'Blocked retry changed receipt';
end$$;
reset role;
do $$begin assert (select value from member_removal_test.related_before where n=23)=member_removal_test.related(23) and exists(select 1 from public.messages where id=member_removal_test.id(81)),'Blocked removal changed protected message, membership or cascading records';end$$;
-- Only this fixture resolves its synthetic restricting row. The removal RPC never does.
delete from public.messages where id=member_removal_test.id(81);
set role authenticated;
do $$begin assert member_removal_test.rpc((select request from member_removal_test.cases where name='related-records-blocked'))=(select receipt from member_removal_test.cases where name='related-records-blocked'),'Resolved constraint changed immutable blocked receipt';end$$;
reset role;
do $$begin assert (select value from member_removal_test.related_before where n=23)=member_removal_test.related(23),'Historical blocked retry removed membership after constraint resolved';end$$;
set role authenticated;
select set_config('request.jwt.claim.sub',member_removal_test.id(5)::text,false);
select member_removal_test.denied(member_removal_test.request(221,22),'42501');
select set_config('request.jwt.claim.sub',member_removal_test.id(2)::text,false);
select member_removal_test.denied((select request from member_removal_test.cases where name='owner-applied-with-cascades'),'42501');
reset role;
select set_config('request.jwt.claim.sub',member_removal_test.id(1)::text,false);
create function member_removal_test.fail_receipt() returns trigger language plpgsql as $$begin if new.request_nonce=member_removal_test.id(500) then raise exception 'Synthetic late failure' using errcode='23514';end if;return new;end$$;
create trigger member_removal_test_failure before insert on private.mobile_member_removal_receipts for each row execute function member_removal_test.fail_receipt();
set role authenticated;
select member_removal_test.denied(member_removal_test.request(500,24),'23514');
reset role;
do $$begin assert (select value from member_removal_test.related_before where n=24)=member_removal_test.related(24) and not exists(select 1 from private.mobile_member_removal_receipts where request_nonce=member_removal_test.id(500)),'Late ledger failure did not restore membership and every cascade';end$$;
drop trigger member_removal_test_failure on private.mobile_member_removal_receipts;
set role authenticated;
select member_removal_test.capture('late-failure-exact-retry',member_removal_test.request(500,24));
select set_config('request.jwt.claim.sub',member_removal_test.id(3)::text,false);
select member_removal_test.capture('admin-applied',member_removal_test.request(510,25));
reset role;
select set_config('request.jwt.claim.sub',member_removal_test.id(1)::text,false);
select public.set_team_permission_override(member_removal_test.team(),null,member_removal_test.id(10),'members.manage',false);
set role authenticated;
select set_config('request.jwt.claim.sub',member_removal_test.id(3)::text,false);
select member_removal_test.denied((select request from member_removal_test.cases where name='admin-applied'),'42501');
reset role;
select set_config('request.jwt.claim.sub',member_removal_test.id(1)::text,false);
select public.set_team_permission_override(member_removal_test.team(),null,member_removal_test.id(10),'members.manage',true);
insert into public.team_members(id,team_id,profile_id,role,status,ministry) values(member_removal_test.id(25),member_removal_test.team(),member_removal_test.id(11),'media','inactive','Replacement');
create table member_removal_test.replacement as select to_jsonb(m) value from public.team_members m where id=member_removal_test.id(25);
set role authenticated;
select set_config('request.jwt.claim.sub',member_removal_test.id(3)::text,false);
do $$begin assert member_removal_test.rpc((select request from member_removal_test.cases where name='admin-applied'))=(select receipt from member_removal_test.cases where name='admin-applied'),'Replacement replay changed receipt';end$$;
reset role;
do $$begin assert (select value from member_removal_test.replacement)=(select to_jsonb(m) from public.team_members m where id=member_removal_test.id(25)),'Historical retry removed replacement';end$$;
select set_config('request.jwt.claim.sub',member_removal_test.id(1)::text,false);
update public.team_members set role='member' where id=member_removal_test.id(10);
set role authenticated;
select set_config('request.jwt.claim.sub',member_removal_test.id(3)::text,false);
select member_removal_test.denied((select request from member_removal_test.cases where name='admin-applied'),'42501');
do $$declare denied boolean:=false;begin begin perform 1 from private.mobile_member_removal_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private ledger readable';end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_member_removal_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Ledger mutable';end$$;
set role anon;
do $$declare denied boolean:=false;begin begin perform public.mobile_apply_member_removal(null,null,'{}');exception when insufficient_privilege then denied:=true;end;assert denied,'Anonymous removal allowed';end$$;
reset role;
select 'PASS member removal, legitimate cascades/SET NULL, protected-reference blocking and atomic immutable recovery' as result;
