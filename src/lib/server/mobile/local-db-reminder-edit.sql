\set ON_ERROR_STOP on
set timezone='UTC';
-- Synthetic disposable loopback assertions only, never hosted execution.
create schema reminder_edit_test;
create function reminder_edit_test.id(n integer) returns uuid language sql immutable as $$select ('98000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table reminder_edit_test.ids(key text primary key,id uuid not null);
create table reminder_edit_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
create table reminder_edit_test.pages(identity jsonb not null,page jsonb not null);
grant usage on schema reminder_edit_test to authenticated;
grant select,insert on reminder_edit_test.ids,reminder_edit_test.cases,reminder_edit_test.pages to authenticated;
insert into auth.users(id,email) select reminder_edit_test.id(n),'reminder-'||n||'@example.test' from generate_series(1,6) n;
select set_config('request.jwt.claim.sub',reminder_edit_test.id(1)::text,false);
insert into reminder_edit_test.ids select 'team',team_id from public.create_team_workspace('Reminder A','RA-61022');
select set_config('request.jwt.claim.sub',reminder_edit_test.id(2)::text,false);
insert into reminder_edit_test.ids select 'other',team_id from public.create_team_workspace('Reminder B','RB-61022');
insert into public.notifications(team_id,profile_id,title,body,notice_group_id,created_by) select id,reminder_edit_test.id(2),'Foreign','Foreign body',reminder_edit_test.id(999),reminder_edit_test.id(2) from reminder_edit_test.ids where key='other';
select set_config('request.jwt.claim.sub',reminder_edit_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status) select reminder_edit_test.id(10),id,reminder_edit_test.id(3),'admin','active' from reminder_edit_test.ids where key='team';
insert into public.team_members(id,team_id,profile_id,role,status) select reminder_edit_test.id(11),id,reminder_edit_test.id(4),'member','active' from reminder_edit_test.ids where key='team';
insert into public.team_members(id,team_id,profile_id,role,status) select reminder_edit_test.id(12),id,reminder_edit_test.id(5),'pastor','active' from reminder_edit_test.ids where key='team';
insert into public.team_members(id,team_id,profile_id,role,status) select reminder_edit_test.id(13),id,reminder_edit_test.id(6),'dancer','inactive' from reminder_edit_test.ids where key='team';
create function reminder_edit_test.team() returns uuid language sql stable as $$select id from reminder_edit_test.ids where key='team'$$;
create function reminder_edit_test.target(n integer,kind text default 'group') returns jsonb language sql immutable as $$select jsonb_build_object('kind',kind,'id',reminder_edit_test.id(n))$$;
create function reminder_edit_test.base(target jsonb) returns jsonb language sql stable security definer set search_path='' as $$select private.mobile_reminder_base(reminder_edit_test.team(),target)$$;
create function reminder_edit_test.request(action text,n integer,target jsonb) returns jsonb language sql stable as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',reminder_edit_test.team(),'memberId',(select id from public.team_members where team_id=reminder_edit_test.team() and profile_id=auth.uid() and status='active'),
 'requestNonce',reminder_edit_test.id(n),'target',target,'action',action,'base',case when action='create' then null else reminder_edit_test.base(target) end)
 ||case when action='create' then jsonb_build_object('value',jsonb_build_object('title','Reminder','body','Full reminder body','priority','normal','eventId',null,'targetPath','/reminders','scheduledFor','2027-01-31','recurrence','weekly','occurrences',2,'target',jsonb_build_object('kind','all')))
 when action='edit' then jsonb_build_object('value',jsonb_build_object('title','Edited reminder','body','Edited full body','priority','important')) else '{}'::jsonb end;
$$;
create function reminder_edit_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_reminder_edit((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function reminder_edit_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=reminder_edit_test.rpc(request);insert into reminder_edit_test.cases values(label,request,result);return result;end$$;
create function reminder_edit_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin begin perform reminder_edit_test.rpc(request);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;assert denied,'Expected reminder denial '||expected;end$$;
set role authenticated;
do $$declare req jsonb;result jsonb;rows_before jsonb;begin
 req:=reminder_edit_test.request('create',200,reminder_edit_test.target(100));result:=reminder_edit_test.capture('weekly-all-created',req);
 assert result->>'status'='applied' and (result->>'affectedCount')::integer=8 and result#>>'{current,recipientCount}'='4','Atomic recurring audience failed';
 assert (result#>>'{current,firstScheduledFor}')::timestamptz='2027-01-30T16:00:00Z'::timestamptz and (result#>>'{current,lastScheduledFor}')::timestamptz='2027-02-06T16:00:00Z'::timestamptz,'Manual Manila/weekly schedule changed';
 select jsonb_agg(to_jsonb(n) order by id) into rows_before from public.notifications n where notice_group_id=reminder_edit_test.id(100);
 assert reminder_edit_test.rpc(req)=result and rows_before=(select jsonb_agg(to_jsonb(n) order by id) from public.notifications n where notice_group_id=reminder_edit_test.id(100)),'Lost reply repeated creation or timestamp writes';
 perform reminder_edit_test.denied(jsonb_set(req,'{value,title}','"Changed immutable intent"'),'22023');
 perform reminder_edit_test.denied(req||'{"permission":"members.manage"}','22023');
 perform reminder_edit_test.denied(reminder_edit_test.request('create',201,reminder_edit_test.target(999)),'42501');
 perform reminder_edit_test.denied(jsonb_set(reminder_edit_test.request('create',202,reminder_edit_test.target(102)),'{value,target}','{"kind":"person","memberId":"98000000-0000-4000-8000-000000000013"}'),'22023');
 perform reminder_edit_test.denied(jsonb_set(reminder_edit_test.request('create',203,reminder_edit_test.target(103)),'{value,targetPath}','"https://attacker.test"'),'22023');
 perform reminder_edit_test.denied(jsonb_set(reminder_edit_test.request('create',204,reminder_edit_test.target(104)),'{value,occurrences}','13'),'22023');
 perform reminder_edit_test.denied(jsonb_set(reminder_edit_test.request('create',205,reminder_edit_test.target(105)),'{value,scheduledFor}','"2027-02-30"'),'22008');
 req:=reminder_edit_test.request('create',206,reminder_edit_test.target(106));req:=jsonb_set(jsonb_set(req,'{value,recurrence}','"monthly"'),'{value,occurrences}','3');
 req:=jsonb_set(req,'{value,target}','{"kind":"person","memberId":"98000000-0000-4000-8000-000000000011"}');result:=reminder_edit_test.capture('monthly-person-created',req);
 assert result#>>'{current,rowCount}'='3' and (result#>>'{current,lastScheduledFor}')::timestamptz='2027-03-30T16:00:00Z'::timestamptz,'Monthly original Manila day not retained';
 assert exists(select 1 from public.notifications where notice_group_id=reminder_edit_test.id(106) and recurrence_index=1 and scheduled_for='2027-02-27T16:00:00Z'::timestamptz),'Jan31 did not clamp to Feb28 Manila';
 req:=jsonb_set(jsonb_set(req,'{requestNonce}',to_jsonb(reminder_edit_test.id(207))),'{target,id}',to_jsonb(reminder_edit_test.id(107)));req:=jsonb_set(req,'{value,scheduledFor}','"2028-01-31"');result:=reminder_edit_test.capture('leap-monthly-created',req);
 assert exists(select 1 from public.notifications where notice_group_id=reminder_edit_test.id(107) and recurrence_index=1 and scheduled_for='2028-02-28T16:00:00Z'::timestamptz),'Leap Feb29 clamp failed';
 req:=reminder_edit_test.request('create',208,reminder_edit_test.target(108));req:=jsonb_set(jsonb_set(req,'{value,recurrence}','"none"'),'{value,scheduledFor}','null');result:=reminder_edit_test.capture('immediate-created',req);
 assert (result#>>'{current,firstScheduledFor}')::timestamptz=(result#>>'{current,createdAt}')::timestamptz and result#>>'{current,occurrences}'='1','Immediate schedule did not retain a durable anchor';
 req:=reminder_edit_test.request('create',209,reminder_edit_test.target(100));result:=reminder_edit_test.capture('create-collision',req);assert result->>'status'='conflict' and result->>'affectedCount'='0','Create collision overwrote group';
 req:=reminder_edit_test.request('create',260,'{"kind":"group","id":"98ABCDEF-ABCD-4ABC-8DEF-000000000900"}');result:=reminder_edit_test.capture('mixedcase-created',req);assert result->>'status'='applied','UUID spelling rejected valid target';
 req:=reminder_edit_test.request('create',261,'{"kind":"group","id":"98abcdef-abcd-4abc-8def-000000000900"}');result:=reminder_edit_test.capture('sameuuid-collision',req);assert result->>'status'='conflict','UUID case created a duplicate logical group';
end$$;
-- Read/ack updates do not alter the management fingerprint or copied personal truth.
insert into reminder_edit_test.ids values('before-ack-hash',(select substring(reminder_edit_test.base(reminder_edit_test.target(100))->>'fingerprint',1,32)::uuid));
select set_config('request.jwt.claim.sub',reminder_edit_test.id(4)::text,false);
update public.notifications set read_at='2026-10-22T01:00:00Z',acknowledged_at='2026-10-22T01:00:00Z' where notice_group_id=reminder_edit_test.id(100) and profile_id=auth.uid();
select set_config('request.jwt.claim.sub',reminder_edit_test.id(1)::text,false);
do $$declare req jsonb;result jsonb;before_hash text;begin
 select replace(id::text,'-','') into before_hash from reminder_edit_test.ids where key='before-ack-hash';
 assert substring(reminder_edit_test.base(reminder_edit_test.target(100))->>'fingerprint',1,32)=before_hash,'Personal receipt updates invalidated shared CAS';
 req:=reminder_edit_test.request('edit',210,reminder_edit_test.target(100));result:=reminder_edit_test.capture('content-edited',req);
 assert result->>'status'='applied' and result->>'affectedCount'='8','Wholegroup content edit incomplete';
 assert (select count(*)=2 from public.notifications where notice_group_id=reminder_edit_test.id(100) and profile_id=reminder_edit_test.id(4) and acknowledged_at='2026-10-22T01:00:00Z'::timestamptz),'Content edit wiped own acknowledgements';
 assert reminder_edit_test.rpc(req)=result,'Edit lost-reply replay changed receipt';
 req:=jsonb_set(req,'{requestNonce}',to_jsonb(reminder_edit_test.id(211)));result:=reminder_edit_test.capture('stale-content-conflict',req);assert result->>'status'='conflict' and result->>'affectedCount'='0','Stale fingerprint overwrote new content';
 req:=reminder_edit_test.request('delete',212,reminder_edit_test.target(106));result:=reminder_edit_test.capture('whole-group-deleted',req);assert result->>'status'='applied' and result->>'affectedCount'='3' and result->'current'='null'::jsonb,'Wholegroup delete failed';
 req:=jsonb_set(req,'{requestNonce}',to_jsonb(reminder_edit_test.id(213)));result:=reminder_edit_test.capture('already-missing',req);assert result->>'status'='missing','Missing group claimed acceptance';
end$$;
reset role;
-- AsOf bounds inventory only: later-added rows of an existing group must be included.
insert into public.notifications(team_id,profile_id,title,body,priority,target_path,target_role,target_profile_id,target_label,scheduled_for,recurrence_rule,recurrence_index,recurrence_total,notice_group_id,created_by,created_at)
 select team_id,profile_id,title,body,priority,target_path,target_role,target_profile_id,target_label,scheduled_for,recurrence_rule,recurrence_index,recurrence_total,notice_group_id,created_by,clock_timestamp()+interval '1 day' from public.notifications where notice_group_id=reminder_edit_test.id(100) order by id limit 1;
insert into public.notifications(id,team_id,profile_id,title,body,target_path,scheduled_for) values(reminder_edit_test.id(500),reminder_edit_test.team(),reminder_edit_test.id(1),'Legacy individual',null,'https://legacy.example.test/retained','2030-01-01'),
 (reminder_edit_test.id(501),reminder_edit_test.team(),reminder_edit_test.id(4),'Private legacy notification','Private recipient payload','/reminders','2030-01-01');
set role authenticated;
do $$declare page jsonb;member uuid;req jsonb;begin
 select id into member from public.team_members where team_id=reminder_edit_test.team() and profile_id=auth.uid();
 page:=public.mobile_read_reminder_management(reminder_edit_test.team(),member,jsonb_build_object('asOf',clock_timestamp()));
 assert exists(select 1 from jsonb_array_elements(page->'items') item where item->>'id'=reminder_edit_test.id(100)::text and item->>'rowCount'='9'),'Later-added group row was hidden by cutoff';
 assert exists(select 1 from jsonb_array_elements(page->'items') item where item->>'kind'='legacy' and item->>'id'=reminder_edit_test.id(500)::text),'Future own legacy row missing';
 assert not exists(select 1 from jsonb_array_elements(page->'items') item where item->>'id'=reminder_edit_test.id(501)::text),'Manager read another recipient legacy payload';
 req:=reminder_edit_test.request('delete',299,reminder_edit_test.target(500,'legacy'));req:=jsonb_set(jsonb_set(req,'{target,id}',to_jsonb(reminder_edit_test.id(501))),'{base,id}',to_jsonb(reminder_edit_test.id(501)));
 perform reminder_edit_test.denied(req,'42501');
 insert into reminder_edit_test.pages values(jsonb_build_object('userId',auth.uid(),'teamId',reminder_edit_test.team(),'memberId',member,'teamName','Reminder A','role','owner','permissions',jsonb_build_array('members.manage')),page);
 assert public.mobile_read_reminder_management(reminder_edit_test.team(),member,page->'nextCursor')->'items'='[]'::jsonb,'Keyset did not exhaust after final current group';
end$$;
select reminder_edit_test.capture('legacy-edited',reminder_edit_test.request('edit',214,reminder_edit_test.target(500,'legacy')));
select reminder_edit_test.capture('legacy-deleted',reminder_edit_test.request('delete',215,reminder_edit_test.target(500,'legacy')));
select set_config('request.jwt.claim.sub',reminder_edit_test.id(3)::text,false);
select reminder_edit_test.capture('admin-edited',reminder_edit_test.request('edit',216,reminder_edit_test.target(100)));
select set_config('request.jwt.claim.sub',reminder_edit_test.id(4)::text,false);
select reminder_edit_test.denied(reminder_edit_test.request('create',217,reminder_edit_test.target(117)),'42501');
do $$declare denied boolean:=false;begin begin perform public.mobile_read_reminder_management(reminder_edit_test.team(),reminder_edit_test.id(11),'{}');exception when insufficient_privilege then denied:=true;end;assert denied,'Nonmanager read other members or future rows';end$$;
reset role;
select set_config('request.jwt.claim.sub',reminder_edit_test.id(1)::text,false);
-- Synthetic insert failure at a later occurrence must roll back all previous rows and ledger.
create function reminder_edit_test.fail_later() returns trigger language plpgsql as $$begin if new.notice_group_id=reminder_edit_test.id(150) and new.recurrence_index=1 then raise exception 'Synthetic later occurrence failure' using errcode='23514';end if;return new;end$$;
create trigger reminder_edit_test_fail before insert on public.notifications for each row execute function reminder_edit_test.fail_later();
set role authenticated;
select reminder_edit_test.denied(reminder_edit_test.request('create',250,reminder_edit_test.target(150)),'23514');
reset role;
do $$begin assert not exists(select 1 from public.notifications where notice_group_id=reminder_edit_test.id(150)) and not exists(select 1 from private.mobile_reminder_edit_receipts where request_nonce=reminder_edit_test.id(250)),'Later failure left partial recipients/occurrences/receipt';end$$;
drop trigger reminder_edit_test_fail on public.notifications;
select public.set_team_permission_override(reminder_edit_test.team(),null,reminder_edit_test.id(10),'members.manage',false);
set role authenticated;
select set_config('request.jwt.claim.sub',reminder_edit_test.id(3)::text,false);
select reminder_edit_test.denied((select request from reminder_edit_test.cases where name='admin-edited'),'42501');
reset role;
select set_config('request.jwt.claim.sub',reminder_edit_test.id(1)::text,false);
select public.set_team_permission_override(reminder_edit_test.team(),null,reminder_edit_test.id(10),'members.manage',null);
update public.team_members set status='inactive' where id=reminder_edit_test.id(10);
set role authenticated;
select set_config('request.jwt.claim.sub',reminder_edit_test.id(3)::text,false);
select reminder_edit_test.denied((select request from reminder_edit_test.cases where name='admin-edited'),'42501');
reset role;
select set_config('request.jwt.claim.sub',reminder_edit_test.id(1)::text,false);
update public.team_members set status='active' where id=reminder_edit_test.id(10);
-- Actual recipient upper bound, without generating60000delivery rows.
insert into auth.users(id,email) select reminder_edit_test.id(10000+n),'reminder-bound-'||n||'@example.test' from generate_series(1,5000) n;
insert into public.team_members(id,team_id,profile_id,role,status) select reminder_edit_test.id(20000+n),reminder_edit_test.team(),reminder_edit_test.id(10000+n),'member','active' from generate_series(1,5000) n;
set role authenticated;
select reminder_edit_test.denied(reminder_edit_test.request('create',251,reminder_edit_test.target(151)),'22023');
reset role;
delete from public.team_members where id between reminder_edit_test.id(20001) and reminder_edit_test.id(25000);
-- Historical delete must never delete newly-created rows reusing that group key.
insert into public.notifications(team_id,profile_id,title,body,notice_group_id,created_by) values(reminder_edit_test.team(),reminder_edit_test.id(1),'Replacement','Replacement body',reminder_edit_test.id(106),reminder_edit_test.id(1));
insert into public.notifications(id,team_id,profile_id,title,body) values(reminder_edit_test.id(500),reminder_edit_test.team(),reminder_edit_test.id(4),'Another recipient replacement','Must stay private');
set role authenticated;
do $$declare req jsonb;denied boolean:=false;begin
 select request into req from reminder_edit_test.cases where name='whole-group-deleted';assert reminder_edit_test.rpc(req)=(select receipt from reminder_edit_test.cases where name='whole-group-deleted'),'Historical delete receipt changed';
 assert exists(select 1 from public.notifications where notice_group_id=reminder_edit_test.id(106) and title='Replacement'),'Historical replay deleted replacement rows';
 select request into req from reminder_edit_test.cases where name='weekly-all-created';assert reminder_edit_test.rpc(req)=(select receipt from reminder_edit_test.cases where name='weekly-all-created'),'Historical create replay changed old receipt';
 perform reminder_edit_test.denied((select request from reminder_edit_test.cases where name='legacy-deleted'),'42501');
 begin perform 1 from private.mobile_reminder_edit_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private ledger directly readable';
end$$;
reset role;
do $$declare denied boolean:=false;begin begin update private.mobile_reminder_edit_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Immutable ledger was editable';end$$;
select 'PASS reminder atomic recurring audience/create/edit/delete, Manila calendar clamp, group CAS, personal-receipt preservation, future management, bounds and historical non-replay' as result;
