\set ON_ERROR_STOP on
set timezone='UTC';
-- Synthetic disposable loopback verification only. Never run against hosted data.
create schema announcement_edit_test;
create function announcement_edit_test.id(n integer) returns uuid language sql immutable as $$select ('97000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table announcement_edit_test.ids(key text primary key,id uuid not null);
create table announcement_edit_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
grant usage on schema announcement_edit_test to authenticated;
grant select,insert on announcement_edit_test.ids,announcement_edit_test.cases to authenticated;
insert into auth.users(id,email) select announcement_edit_test.id(n),'announcement-'||n||'@example.test' from generate_series(1,6) n;
select set_config('request.jwt.claim.sub',announcement_edit_test.id(1)::text,false);
insert into announcement_edit_test.ids select 'team',team_id from public.create_team_workspace('Announcement A','AA-61022');
select set_config('request.jwt.claim.sub',announcement_edit_test.id(2)::text,false);
insert into announcement_edit_test.ids select 'other',team_id from public.create_team_workspace('Announcement B','AB-61022');
select set_config('request.jwt.claim.sub',announcement_edit_test.id(1)::text,false);
insert into public.team_members(id,team_id,profile_id,role,status) select announcement_edit_test.id(10),id,announcement_edit_test.id(3),'admin','active' from announcement_edit_test.ids where key='team';
insert into public.team_members(id,team_id,profile_id,role,status) select announcement_edit_test.id(11),id,announcement_edit_test.id(4),'member','active' from announcement_edit_test.ids where key='team';
insert into public.team_members(id,team_id,profile_id,role,status) select announcement_edit_test.id(12),id,announcement_edit_test.id(5),'pastor','active' from announcement_edit_test.ids where key='team';
insert into public.team_members(id,team_id,profile_id,role,status) select announcement_edit_test.id(13),id,announcement_edit_test.id(6),'dancer','inactive' from announcement_edit_test.ids where key='team';
insert into public.events(id,team_id,name,type,event_date,starts_at,created_by) select announcement_edit_test.id(30),id,'Current event','service','2026-10-25','09:00',announcement_edit_test.id(1) from announcement_edit_test.ids where key='team';
select set_config('request.jwt.claim.sub',announcement_edit_test.id(2)::text,false);
insert into public.events(id,team_id,name,type,event_date,starts_at,created_by) select announcement_edit_test.id(31),id,'Foreign event','service','2026-10-25','09:00',announcement_edit_test.id(2) from announcement_edit_test.ids where key='other';
insert into public.announcements(id,team_id,title,body,category,created_by) select announcement_edit_test.id(32),id,'Foreign','Foreign body','General',announcement_edit_test.id(2) from announcement_edit_test.ids where key='other';
select set_config('request.jwt.claim.sub',announcement_edit_test.id(1)::text,false);
update public.profiles set full_name=null,email=repeat('a',241)||'@example.test' where id=announcement_edit_test.id(4);
create function announcement_edit_test.team() returns uuid language sql stable as $$select id from announcement_edit_test.ids where key='team'$$;
create function announcement_edit_test.base(target uuid) returns jsonb language sql stable security definer set search_path='' as $$select private.mobile_announcement_base(a) from public.announcements a where id=target and team_id=announcement_edit_test.team()$$;
create function announcement_edit_test.request(action text,n integer,target uuid) returns jsonb language sql stable as $$
 select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',announcement_edit_test.team(),'memberId',(select id from public.team_members where team_id=announcement_edit_test.team() and profile_id=auth.uid() and status='active'),
 'requestNonce',announcement_edit_test.id(n),'announcementId',target,'action',action,'base',case when action='create' then null else announcement_edit_test.base(target) end)
 ||case when action='create' then jsonb_build_object('value',jsonb_build_object('title','Notice','body','Full notice body','category','General','priority','normal','isPinned',false,'eventId',announcement_edit_test.id(30),'target',jsonb_build_object('kind','all')))
 when action='edit' then jsonb_build_object('value',jsonb_build_object('title','Edited notice','body','Edited complete body','category','Service','priority','important'))
 when action='pin' then jsonb_build_object('isPinned',true) else '{}'::jsonb end;
$$;
create function announcement_edit_test.rpc(request jsonb) returns jsonb language sql as $$select public.mobile_apply_announcement_edit((request->>'teamId')::uuid,(request->>'memberId')::uuid,request)$$;
create function announcement_edit_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin result:=announcement_edit_test.rpc(request);insert into announcement_edit_test.cases values(label,request,result);return result;end$$;
create function announcement_edit_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare rejected boolean:=false;begin begin perform announcement_edit_test.rpc(request);exception when others then if sqlstate=expected then rejected:=true;else raise;end if;end;assert rejected,'Expected rejection '||expected;end$$;
set role authenticated;
do $$declare req jsonb;result jsonb;before_row jsonb;begin
 req:=announcement_edit_test.request('create',200,announcement_edit_test.id(100));result:=announcement_edit_test.capture('all-created',req);
 assert result->>'status'='applied' and result#>>'{current,createdBy}'=auth.uid()::text,'Create failed';
 assert (select count(*)=4 from public.announcement_receipts where announcement_id=announcement_edit_test.id(100)),'Atomic delivery set incomplete';
 select to_jsonb(a) into before_row from public.announcements a where id=announcement_edit_test.id(100);
 assert announcement_edit_test.rpc(req)=result,'Lost reply retry changed receipt/timestamp';
 assert (select to_jsonb(a)=before_row from public.announcements a where id=announcement_edit_test.id(100)),'Retry repeated the write';
 perform announcement_edit_test.denied(jsonb_set(req,'{value,title}','"Changed immutable payload"'),'22023');
 perform announcement_edit_test.denied(req||'{"permission":"members.manage"}','22023');
 perform announcement_edit_test.denied(jsonb_set(announcement_edit_test.request('create',201,announcement_edit_test.id(101)),'{value,eventId}',to_jsonb(announcement_edit_test.id(31))),'22023');
 perform announcement_edit_test.denied(jsonb_set(announcement_edit_test.request('create',202,announcement_edit_test.id(102)),'{value,target}','{"kind":"person","memberId":"97000000-0000-4000-8000-000000000013"}'),'22023');
 perform announcement_edit_test.denied(jsonb_set(announcement_edit_test.request('create',203,announcement_edit_test.id(103)),'{value,target}','{"kind":"role","role":"dancer"}'),'22023');
 perform announcement_edit_test.denied(announcement_edit_test.request('create',204,announcement_edit_test.id(32)),'42501');
 perform announcement_edit_test.denied(jsonb_set(announcement_edit_test.request('create',205,announcement_edit_test.id(105)),'{value,body}',to_jsonb(repeat('x',3001))),'22023');
 req:=jsonb_set(announcement_edit_test.request('create',206,announcement_edit_test.id(106)),'{value,target}','{"kind":"person","memberId":"97000000-0000-4000-8000-000000000011"}');
 result:=announcement_edit_test.capture('person-created',req);assert length(result#>>'{current,targetLabel}')=254 and result#>>'{current,targetProfileId}'=announcement_edit_test.id(4)::text,'Person target not resolved from active membership';
 assert (select count(*)=1 from public.announcement_receipts where announcement_id=announcement_edit_test.id(106)),'Person delivery mismatch';
 req:=jsonb_set(announcement_edit_test.request('create',207,announcement_edit_test.id(107)),'{value,target}','{"kind":"role","role":"pastor"}');
 result:=announcement_edit_test.capture('role-created',req);assert result#>>'{current,targetLabel}'='Pastors','Role label differs from website';
 assert (select count(*)=1 from public.announcement_receipts where announcement_id=announcement_edit_test.id(107)),'Role delivery mismatch';
 req:=announcement_edit_test.request('create',208,announcement_edit_test.id(100));result:=announcement_edit_test.capture('create-collision',req);assert result->>'status'='conflict','Existing ID overwritten';
end$$;
-- Content and pin edits preserve audience, event linkage and personal acknowledgements.
select set_config('request.jwt.claim.sub',announcement_edit_test.id(4)::text,false);
update public.announcement_receipts set acknowledged_at='2026-10-22T01:00:00Z',read_at='2026-10-22T01:00:00Z' where announcement_id=announcement_edit_test.id(100) and profile_id=auth.uid();
select set_config('request.jwt.claim.sub',announcement_edit_test.id(1)::text,false);
do $$declare req jsonb;result jsonb;original jsonb;begin
 original:=announcement_edit_test.base(announcement_edit_test.id(100));req:=announcement_edit_test.request('edit',210,announcement_edit_test.id(100));
 -- Browser ISO Z and PostgreSQL +00:00 represent the same original row timestamp.
 req:=jsonb_set(req,'{base,createdAt}',to_jsonb(replace(req#>>'{base,createdAt}','+00:00','Z')));
 result:=announcement_edit_test.capture('content-edited',req);
 assert result->>'status'='applied' and result->'current'=(original||(req->'value')),'Content did not preserve exact base links';
 assert (select acknowledged_at='2026-10-22T01:00:00Z'::timestamptz from public.announcement_receipts where announcement_id=announcement_edit_test.id(100) and profile_id=announcement_edit_test.id(4)),'Acknowledgement wiped';
 assert announcement_edit_test.rpc(req)=result,'Edit retry changed timestamp';
 req:=announcement_edit_test.request('pin',211,announcement_edit_test.id(100));result:=announcement_edit_test.capture('pinned',req);assert result->>'status'='applied' and result#>'{current,isPinned}'='true'::jsonb,'Pin failed';
 req:=jsonb_set((select request from announcement_edit_test.cases where name='content-edited'),'{requestNonce}',to_jsonb(announcement_edit_test.id(212)));
 result:=announcement_edit_test.capture('stale-conflict',req);assert result->>'status'='conflict' and result->'current'=announcement_edit_test.base(announcement_edit_test.id(100)),'Stale base overwrote pin';
 req:=announcement_edit_test.request('delete',213,announcement_edit_test.id(107));result:=announcement_edit_test.capture('deleted',req);assert result->>'status'='applied' and result->'current'='null'::jsonb,'Delete failed';
 assert not exists(select 1 from public.announcement_receipts where announcement_id=announcement_edit_test.id(107)),'Deletion did not cascade delivery receipts';
 req:=jsonb_set(req,'{requestNonce}',to_jsonb(announcement_edit_test.id(214)));result:=announcement_edit_test.capture('already-missing',req);assert result->>'status'='missing','Missing target fabricated acceptance';
end$$;
-- Ordinary members and pastor/shared reviewers do not acquire native management authority.
select set_config('request.jwt.claim.sub',announcement_edit_test.id(4)::text,false);
select announcement_edit_test.denied(announcement_edit_test.request('create',220,announcement_edit_test.id(120)),'42501');
select set_config('request.jwt.claim.sub',announcement_edit_test.id(5)::text,false);
select announcement_edit_test.denied(announcement_edit_test.request('edit',221,announcement_edit_test.id(100)),'42501');
select set_config('request.jwt.claim.sub',announcement_edit_test.id(3)::text,false);
select announcement_edit_test.capture('admin-edited',announcement_edit_test.request('edit',222,announcement_edit_test.id(100)));
reset role;
-- A failed delivery insert rolls back both announcement and immutable receipt.
create function announcement_edit_test.fail_delivery() returns trigger language plpgsql as $$begin if new.announcement_id=announcement_edit_test.id(150) then raise exception 'Synthetic delivery failure' using errcode='23514';end if;return new;end$$;
create trigger announcement_edit_test_delivery before insert on public.announcement_receipts for each row execute function announcement_edit_test.fail_delivery();
select set_config('request.jwt.claim.sub',announcement_edit_test.id(1)::text,false);
set role authenticated;
select announcement_edit_test.denied(announcement_edit_test.request('create',250,announcement_edit_test.id(150)),'23514');
reset role;
do $$begin assert not exists(select 1 from public.announcements where id=announcement_edit_test.id(150)) and not exists(select 1 from private.mobile_announcement_edit_receipts where request_nonce=announcement_edit_test.id(250)),'Failed delivery left partial mutation';end$$;
drop trigger announcement_edit_test_delivery on public.announcement_receipts;
-- A historical receipt cannot replay a write after deletion, or disclose under revoked authority.
select public.set_team_permission_override(announcement_edit_test.team(),null,announcement_edit_test.id(10),'members.manage',false);
set role authenticated;
select set_config('request.jwt.claim.sub',announcement_edit_test.id(3)::text,false);
select announcement_edit_test.denied((select request from announcement_edit_test.cases where name='admin-edited'),'42501');
reset role;
select set_config('request.jwt.claim.sub',announcement_edit_test.id(1)::text,false);
select public.set_team_permission_override(announcement_edit_test.team(),null,announcement_edit_test.id(10),'members.manage',null);
update public.team_members set status='inactive' where id=announcement_edit_test.id(10);
set role authenticated;
select set_config('request.jwt.claim.sub',announcement_edit_test.id(3)::text,false);
select announcement_edit_test.denied((select request from announcement_edit_test.cases where name='admin-edited'),'42501');
reset role;
select set_config('request.jwt.claim.sub',announcement_edit_test.id(1)::text,false);
update public.team_members set status='active' where id=announcement_edit_test.id(10);
insert into public.announcements(id,team_id,title,body,category,created_by) values(announcement_edit_test.id(107),announcement_edit_test.team(),'Replacement','Replacement body','General',announcement_edit_test.id(1));
set role authenticated;
do $$declare req jsonb;begin
 select request into req from announcement_edit_test.cases where name='deleted';assert announcement_edit_test.rpc(req)=(select receipt from announcement_edit_test.cases where name='deleted'),'Historical deletion receipt changed';
 assert exists(select 1 from public.announcements where id=announcement_edit_test.id(107) and title='Replacement'),'Historical retry deleted replacement';
 select request into req from announcement_edit_test.cases where name='all-created';assert announcement_edit_test.rpc(req)=(select receipt from announcement_edit_test.cases where name='all-created'),'Historical create replay mutated later content';
 perform announcement_edit_test.denied(jsonb_set(req,'{memberId}',to_jsonb(announcement_edit_test.id(10))),'42501');
end$$;
do $$declare denied boolean:=false;begin begin perform 1 from private.mobile_announcement_edit_receipts;exception when insufficient_privilege then denied:=true;end;assert denied,'Private ledger directly readable';end$$;
reset role;
do $$declare denied boolean:=false;begin
 begin update private.mobile_announcement_edit_receipts set result='{}';exception when insufficient_privilege then denied:=true;end;assert denied,'Immutable receipt was editable';
 assert (select count(*)>=10 from announcement_edit_test.cases),'Expected bounded receipt evidence missing';
end$$;
select 'PASS announcement atomic CRUD/pin, CAS, exact retries, audiences/delivery, rollback, current authorization and historical non-replay' as result;
