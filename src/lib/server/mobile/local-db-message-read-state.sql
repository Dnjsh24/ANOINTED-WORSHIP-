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
create schema message_read_test;
create table message_read_test.evidence(value jsonb);
set role authenticated;
select message_send_test.capture('literal',100,E'50%_\\ precise text');
select message_send_test.capture('nonliteral',101,'50XX ordinary text');
do $$declare mid uuid;first_read timestamptz;begin
 select(response#>>'{message,id}')::uuid into mid from message_send_test.cases where name='literal';
 assert(select count(*)=1 from public.messages where channel_id=message_send_test.channel() and is_delivered and body ilike E'%50\\%\\_%'),'Literal wildcard search broadened';
 insert into public.message_reads(message_id,profile_id) values(mid,auth.uid()) on conflict(message_id,profile_id) do nothing;
 select read_at into first_read from public.message_reads where message_id=mid and profile_id=auth.uid();
 assert first_read is not null,'Own read missing';
 insert into public.message_reads(message_id,profile_id,read_at) values(mid,auth.uid(),now()+interval '1 hour') on conflict(message_id,profile_id) do nothing;
 assert(select read_at=first_read from public.message_reads where message_id=mid and profile_id=auth.uid()),'Retry rewrote firstread';
 assert not exists(select 1 from public.channel_reads where channel_id=message_send_test.channel() and profile_id=auth.uid()),'Exact-ID read advanced channel';
 begin insert into public.message_reads(message_id,profile_id) values(mid,message_send_test.id(2));raise exception 'Cross-reader write allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
-- The API revalidates delivered/channel IDs pre/post; RLS independently denies
-- cross-account and revoked-channel writes, even when the caller knows IDs.
select set_config('request.jwt.claim.sub',message_send_test.id(2)::text,false);
set role authenticated;
do $$declare mid uuid;begin select(response#>>'{message,id}')::uuid into mid from message_send_test.cases where name='nonliteral';begin insert into public.message_reads(message_id,profile_id) values(mid,auth.uid());raise exception 'Foreign channel read allowed';exception when insufficient_privilege then null;end;end$$;
reset role;
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
insert into message_read_test.evidence select jsonb_build_object('request',c.request-'requestNonce'-'body'||jsonb_build_object('messageIds',jsonb_build_array(c.response#>>'{message,id}')),'response',jsonb_build_object('version',2,'request',c.request-'requestNonce'-'body'||jsonb_build_object('messageIds',jsonb_build_array(c.response#>>'{message,id}')),'status','confirmed','items',jsonb_build_array(jsonb_build_object('messageId',r.message_id,'readAt',r.read_at)),'fetchedAt',now())) from message_send_test.cases c join public.message_reads r on r.message_id=(c.response#>>'{message,id}')::uuid where c.name='literal';
delete from public.messages where id=(select(response#>>'{message,id}')::uuid from message_send_test.cases where name='literal');
do $$begin assert not exists(select 1 from public.message_reads where message_id=(select(response#>>'{message,id}')::uuid from message_send_test.cases where name='literal')),'Deleted message read did not cascade';end$$;
delete from public.message_channel_members where channel_id=message_send_test.channel() and team_member_id=message_send_test.member();
set role authenticated;
do $$declare mid uuid;begin select(response#>>'{message,id}')::uuid into mid from message_send_test.cases where name='nonliteral';begin insert into public.message_reads(message_id,profile_id) values(mid,auth.uid());raise exception 'Revoked read allowed';exception when insufficient_privilege then null;end;end$$;
reset role;

