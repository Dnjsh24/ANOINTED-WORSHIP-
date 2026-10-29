\set ON_ERROR_STOP on
set timezone='UTC';
create schema message_send_test;
create function message_send_test.id(n integer) returns uuid language sql immutable as $$select ('99950000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table message_send_test.workspace(value jsonb);
create table message_send_test.cases(name text primary key,request jsonb,response jsonb);
grant usage on schema message_send_test to authenticated;
grant select,insert on all tables in schema message_send_test to authenticated;
insert into auth.users(id,email) select message_send_test.id(n),'message-send-'||n||'@example.test' from generate_series(1,2)n;
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
insert into message_send_test.workspace select public.mobile_create_team_workspace(jsonb_build_object('version',2,'userId',auth.uid(),'requestNonce',message_send_test.id(10),'value',jsonb_build_object('name','Message Team','code','MS-12345','location','Church','callTime','09:00:00','rehearsalTime','08:00:00')))->'workspace';
reset role;
create function message_send_test.channel() returns uuid language sql stable as $$select(value->>'channelId')::uuid from message_send_test.workspace$$;
create function message_send_test.member() returns uuid language sql stable as $$select(value->>'memberId')::uuid from message_send_test.workspace$$;
create function message_send_test.capture(label text,n integer,body text) returns void language plpgsql as $$declare proof record;request jsonb;begin
 select * into proof from public.send_message_once(message_send_test.channel(),message_send_test.id(n),body);
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',tm.team_id,'memberId',tm.id,'memberCreatedAt',tm.created_at,'channelId',message_send_test.channel(),'requestNonce',message_send_test.id(n),'body',body) into request from public.team_members tm where tm.id=message_send_test.member();
 insert into message_send_test.cases values(label,request,jsonb_build_object('version',2,'request',request,'status','confirmed','message',jsonb_build_object('id',proof.id,'createdAt',proof.created_at)));
end$$;
create function message_send_test.denied(channel uuid,n integer,body text,expected text) returns void language plpgsql as $$declare rejected boolean:=false;begin begin perform public.send_message_once(channel,message_send_test.id(n),body);exception when others then if sqlstate=expected then rejected:=true;else raise;end if;end;assert rejected,'Expected denied message send';end$$;
insert into auth.users(id,email) values(message_send_test.id(3),'direct-third@example.test');
insert into public.team_members(id,team_id,profile_id,role,status) select message_send_test.id(n+10),(value->>'teamId')::uuid,message_send_test.id(n),'member','active' from message_send_test.workspace cross join generate_series(2,3)n;
create schema direct_test;
create table direct_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
grant usage on schema direct_test to authenticated;
grant select,insert on direct_test.cases to authenticated;
create function direct_test.request(n integer,target_user integer default 2) returns jsonb language sql stable as $$select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',a.team_id,'memberId',a.id,'memberCreatedAt',a.created_at,'requestNonce',message_send_test.id(n),'target',jsonb_build_object('memberId',b.id,'profileId',b.profile_id,'createdAt',b.created_at)) from public.team_members a join public.team_members b on b.team_id=a.team_id and b.profile_id=message_send_test.id(target_user) where a.profile_id=auth.uid()$$;
create function direct_test.capture(label text,n integer,target_user integer default 2) returns jsonb language plpgsql as $$declare request jsonb:=direct_test.request(n,target_user);receipt jsonb;begin receipt:=public.mobile_open_direct_conversation(request);insert into direct_test.cases values(label,request,receipt);return receipt;end$$;
create function direct_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare rejected boolean:=false;begin begin perform public.mobile_open_direct_conversation(request);exception when others then if sqlstate=expected then rejected:=true;else raise;end if;end;assert rejected,'Expected direct opening denial';end$$;
-- Legacy partial channels remain untouched and must never be repaired/reused.
insert into public.message_channels(id,team_id,name,channel_type,created_by) select message_send_test.id(30),(value->>'teamId')::uuid,'Legacy partial','direct',message_send_test.id(1) from message_send_test.workspace;
insert into public.message_channel_members(channel_id,team_member_id) values(message_send_test.id(30),message_send_test.member());
set role authenticated;
select direct_test.capture('created',100);
select direct_test.capture('exact-retry',100);
select direct_test.capture('fresh-reuse',101);
do $$begin assert(select count(distinct receipt->>'channelId')=1 from direct_test.cases),'Pair duplicated';assert(select receipt->>'channelId'<>message_send_test.id(30)::text from direct_test.cases limit 1),'Partial legacy reused';assert(select receipt=lagged from(select receipt,lag(receipt) over(order by name) lagged from direct_test.cases where name in('created','exact-retry'))r where lagged is not null),'Retry receipt changed';end$$;
select direct_test.denied(direct_test.request(100,3),'22023');
reset role;
-- Final history failure rolls back channel and BOTH memberships.
create function direct_test.fail_late() returns trigger language plpgsql as $$begin if new.request_nonce=message_send_test.id(110) then raise exception 'Synthetic late ledger failure';end if;return new;end$$;
create trigger direct_test_fail_late before insert on private.mobile_direct_conversation_receipts for each row execute function direct_test.fail_late();
create table direct_test.counts as select(select count(*) from public.message_channels) channels,(select count(*) from public.message_channel_members) members;
set role authenticated;
select direct_test.denied(direct_test.request(110,3),'P0001');
reset role;
do $$begin assert(select channels=(select count(*) from public.message_channels) and members=(select count(*) from public.message_channel_members) from direct_test.counts),'Late ledger failure left partial channel';end$$;
drop trigger direct_test_fail_late on private.mobile_direct_conversation_receipts;
select set_config('request.jwt.claim.sub',message_send_test.id(2)::text,false);
set role authenticated;
select direct_test.capture('ordinary-member-reuse',102,1);
select direct_test.denied((select request from direct_test.cases where name='created'),'42501');
reset role;
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
update public.team_members set status='inactive' where id=message_send_test.id(12);
set role authenticated;
select direct_test.denied((select request from direct_test.cases where name='created'),'42501');
reset role;
update public.team_members set status='active' where id=message_send_test.id(12);
delete from public.message_channel_members where channel_id=(select(receipt->>'channelId')::uuid from direct_test.cases where name='created') and team_member_id=message_send_test.id(12);
set role authenticated;
select direct_test.denied((select request from direct_test.cases where name='created'),'42501');
reset role;
do $$begin assert not exists(select 1 from public.message_channel_members where channel_id=(select(receipt->>'channelId')::uuid from direct_test.cases where name='created') and team_member_id=message_send_test.id(12)),'History rejoined removed member';end$$;
-- Pair1/3 remains absent for the runner's reversed-initiator creation race.

