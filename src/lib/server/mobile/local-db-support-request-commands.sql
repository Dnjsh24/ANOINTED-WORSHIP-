\set ON_ERROR_STOP on
set timezone='UTC';
create schema support_commands_test;
create function support_commands_test.id(n integer) returns uuid language sql immutable as $$select ('99900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table support_commands_test.ids(key text primary key,id uuid not null);
create table support_commands_test.evidence(name text primary key,value jsonb not null);
grant usage on schema support_commands_test to authenticated;
grant select,insert on all tables in schema support_commands_test to authenticated;
insert into auth.users(id,email) select support_commands_test.id(n),'support-command-'||n||'@example.test' from generate_series(1,4) n;
select set_config('request.jwt.claim.sub',support_commands_test.id(1)::text,false);
insert into support_commands_test.ids select 'team',team_id from public.create_team_workspace('Support commands fixture','SUP-11023');
create function support_commands_test.team() returns uuid language sql stable as $$select id from support_commands_test.ids where key='team'$$;
insert into public.team_members(id,team_id,profile_id,role,status) values(support_commands_test.id(10),support_commands_test.team(),support_commands_test.id(2),'member','active');
insert into public.wooly_support_accounts(profile_id) values(support_commands_test.id(3));
create function support_commands_test.denied_create(p_id uuid,p_team uuid,p_question text default 'Help') returns void language plpgsql as $$declare blocked boolean:=false;begin begin perform public.create_wooly_support_request(p_id,p_question,'Details','/help',p_team);exception when others then blocked:=true;end;assert blocked,'Expected create denial';end$$;
select set_config('request.jwt.claim.sub',support_commands_test.id(2)::text,false);
set role authenticated;
do $$declare request_id uuid:=support_commands_test.id(100);message_id uuid:=support_commands_test.id(101);v_before jsonb;begin
 assert public.create_wooly_support_request(request_id,' Help ',' Details ','/help',support_commands_test.team())=request_id,'Create failed';
 select to_jsonb(r) into v_before from public.wooly_support_requests r where id=request_id;
 assert public.create_wooly_support_request(request_id,'Help','Details','/help',support_commands_test.team())=request_id,'Exact create retry failed';
 assert (select to_jsonb(r) from public.wooly_support_requests r where id=request_id)=v_before,'Create retry changed row';
 perform support_commands_test.denied_create(request_id,support_commands_test.team(),'Different');
 assert public.reply_wooly_support(request_id,message_id,' My reply ',false)=message_id,'Requester reply failed';
 select to_jsonb(r) into v_before from public.wooly_support_requests r where id=request_id;
 assert public.reply_wooly_support(request_id,message_id,'My reply',false)=message_id,'Exact reply retry failed';
 assert (select to_jsonb(r) from public.wooly_support_requests r where id=request_id)=v_before,'Reply replay changed status/timestamps';
 insert into support_commands_test.evidence values('created',v_before),('message',(select to_jsonb(m) from public.wooly_support_messages m where id=message_id));
end$$;
select public.leave_team_workspace(support_commands_test.team());
select support_commands_test.denied_create(support_commands_test.id(100),support_commands_test.team());
-- Account-owned data is still readable after departure. The API reconciles this
-- exact row before calling the RPC's current-team membership check.
do $$begin assert exists(select 1 from public.wooly_support_requests where id=support_commands_test.id(100) and profile_id=auth.uid()),'Departure hid own request';assert public.reply_wooly_support(support_commands_test.id(100),support_commands_test.id(101),'My reply',false)=support_commands_test.id(101),'Departure prevented requester retry';end$$;
select public.create_wooly_support_request(support_commands_test.id(102),'Account question','','/help',null);
reset role;
select set_config('request.jwt.claim.sub',support_commands_test.id(3)::text,false);
set role authenticated;
do $$declare blocked boolean:=false;begin
 assert public.is_wooly_support(),'Staff fixture missing';
 assert not exists(select 1 from public.wooly_support_requests where id=support_commands_test.id(100) and profile_id=auth.uid()),'Own filter expanded for staff';
 begin perform public.reply_wooly_support(support_commands_test.id(100),support_commands_test.id(103),'Cross-account requester',false);exception when others then blocked:=true;end;
 assert blocked,'Staff replied as another requester';
end$$;
select support_commands_test.denied_create(support_commands_test.id(100),null);
reset role;
select set_config('request.jwt.claim.sub',support_commands_test.id(1)::text,false);
update public.wooly_support_requests set status='closed' where id=support_commands_test.id(100);
select set_config('request.jwt.claim.sub',support_commands_test.id(2)::text,false);
set role authenticated;
select public.reply_wooly_support(support_commands_test.id(100),support_commands_test.id(101),'My reply',false);
do $$begin assert (select status='closed' from public.wooly_support_requests where id=support_commands_test.id(100)),'Exact reply replay reopened request';end$$;
reset role;
