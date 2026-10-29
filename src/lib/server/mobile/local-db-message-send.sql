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
set role authenticated;
select message_send_test.capture('original',100,E'  Original text\n');
select message_send_test.capture('retry',100,E'  Original text\n');
do $$begin assert(select count(distinct response#>>'{message,id}')=1 from message_send_test.cases),'Retry duplicated message';end$$;
select message_send_test.denied(message_send_test.channel(),100,'Changed','22023');
select message_send_test.denied(message_send_test.channel(),101,repeat('x',2001),'23514');
reset role;
insert into public.message_channels(id,team_id,name,channel_type,created_by) select message_send_test.id(20),(value->>'teamId')::uuid,'Other private channel','group',message_send_test.id(1) from message_send_test.workspace;
insert into public.message_channel_members(channel_id,team_member_id) values(message_send_test.id(20),message_send_test.member());
set role authenticated;
select message_send_test.denied(message_send_test.id(20),100,E'  Original text\n','22023');
reset role;
select set_config('request.jwt.claim.sub',message_send_test.id(2)::text,false);
set role authenticated;
select message_send_test.denied(message_send_test.channel(),100,E'  Original text\n','42501');
reset role;
-- Denial after revocation applies even to an already committed exact nonce.
delete from public.message_channel_members where channel_id=message_send_test.channel() and team_member_id=message_send_test.member();
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
select message_send_test.denied(message_send_test.channel(),100,E'  Original text\n','42501');
reset role;
insert into public.message_channel_members(channel_id,team_member_id) values(message_send_test.channel(),message_send_test.member());
-- The following concurrent case is run by the runner using an observed transaction barrier.
