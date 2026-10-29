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
update public.team_members set role='worship_leader' where id=message_send_test.id(12);
select set_config('request.jwt.claim.sub','',false);
insert into public.songs(id,team_id,title,artist,original_key,bpm,lyrics_chords,created_by,created_at,deleted_at) select message_send_test.id(1000+n),(value->>'teamId')::uuid,'Trashed song '||n,'Actual artist','C',100,'Preserved lyrics',message_send_test.id(1),'2026-10-24T03:04:05.123456Z','2026-10-24T04:05:06.654321Z' from message_send_test.workspace cross join generate_series(0,51)n;
insert into public.songs(id,team_id,title,artist,original_key,bpm,lyrics_chords,status,created_by,deleted_at) select message_send_test.id(2000),(value->>'teamId')::uuid,'Pending hidden','Actual artist','C',100,'Hidden lyrics','pending',message_send_test.id(1),clock_timestamp() from message_send_test.workspace;

create schema song_purge_test;
do $$declare tables text[];begin
 with recursive affected(oid) as(select unnest(array['public.songs'::regclass::oid,'public.setlist_songs'::regclass::oid]) union select c.conrelid from pg_constraint c join affected a on a.oid=c.confrelid where c.contype='f' and c.confdeltype='c')
 select array_agg(cl.relname::text order by cl.relname) into tables from affected a join pg_class cl on cl.oid=a.oid where a.oid not in('public.songs'::regclass,'public.setlist_songs'::regclass);
 assert tables=array['dance_notes','mobile_annotations','song_edit_requests','song_favorites','song_readiness','song_versions','user_annotations'],'Actual cascade graph changed; review complete impact before purge';
end$$;
create table song_purge_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
create table song_purge_test.pending(name text primary key,request jsonb not null);
grant usage on schema song_purge_test to authenticated;
grant select,insert on all tables in schema song_purge_test to authenticated;
create function song_purge_test.team() returns uuid language sql stable as $$select(value->>'teamId')::uuid from message_send_test.workspace$$;
create function song_purge_test.request(n integer,song integer default 1000) returns jsonb language plpgsql as $$declare state jsonb;actor public.team_members%rowtype;begin
 select * into actor from public.team_members where team_id=song_purge_test.team() and profile_id=auth.uid();
 state:=public.mobile_read_song_purge_state(actor.team_id,actor.id,message_send_test.id(song));
 return jsonb_build_object('version',2,'userId',auth.uid(),'teamId',actor.team_id,'memberId',actor.id,'memberCreatedAt',actor.created_at,'requestNonce',message_send_test.id(n),'base',state#>'{current,snapshot}','impact',state->'impact');
end$$;
create function song_purge_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare receipt jsonb;begin receipt:=public.mobile_purge_song(request);insert into song_purge_test.cases values(label,request,receipt);return receipt;end$$;
create function song_purge_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare rejected boolean:=false;begin begin perform public.mobile_purge_song(request);exception when others then if sqlstate=expected then rejected:=true;else raise;end if;end;assert rejected,'Expected song purge denial';end$$;
create function song_purge_test.snapshot() returns jsonb language sql as $$select jsonb_build_object(
 'songs',(select jsonb_agg(to_jsonb(x) order by id) from public.songs x),
 'parents',(select jsonb_agg(to_jsonb(x) order by id) from public.setlists x),
 'slots',(select jsonb_agg(to_jsonb(x) order by id) from public.setlist_songs x),
 'favorites',(select jsonb_agg(to_jsonb(x) order by song_id,team_member_id) from public.song_favorites x),
 'versions',(select jsonb_agg(to_jsonb(x) order by id) from public.song_versions x),
 'requests',(select jsonb_agg(to_jsonb(x) order by id) from public.song_edit_requests x),
 'shared',(select jsonb_agg(to_jsonb(x) order by id) from public.shared_edit_requests x),
 'dance',(select jsonb_agg(to_jsonb(x) order by id) from public.dance_notes x),
 'annotations',(select jsonb_agg(to_jsonb(x) order by id) from public.mobile_annotations x),
 'webAnnotations',(select jsonb_agg(to_jsonb(x) order by id) from public.user_annotations x),
 'readiness',(select jsonb_agg(to_jsonb(x) order by event_id,slot_id,team_member_id) from public.song_readiness x),
 'files',(select jsonb_agg(to_jsonb(x) order by id) from public.practice_files x),
 'storage',(select jsonb_agg(to_jsonb(x) order by id) from storage.objects x),
 'sync',(select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.worship_sync_changes x),
 'tombstones',(select jsonb_agg(to_jsonb(x) order by team_id,entity_type,entity_id) from public.mobile_deleted_records x),
 'leases',(select jsonb_agg(to_jsonb(x) order by setlist_id) from private.stage_live_leases x))$$;
-- Build actual linked rows before moving the approved songs to Trash.
select set_config('request.jwt.claim.sub','',false);
update public.songs set deleted_at=null where id in(message_send_test.id(1000),message_send_test.id(1006),message_send_test.id(1008),message_send_test.id(1009),message_send_test.id(1013),message_send_test.id(1014));
insert into public.setlists(id,team_id,name,setlist_date,created_by) select message_send_test.id(3000+n),song_purge_test.team(),'Purge parent '||n,'2026-10-24',message_send_test.id(1) from generate_series(0,6)n;
insert into public.setlist_songs(id,setlist_id,song_id,song_order,assigned_key,notes) select message_send_test.id(4000+n::integer),message_send_test.id(3000+n::integer),message_send_test.id(song),1,'C','Private slot body' from unnest(array[1000,1006,1008,1009,1013,1014]) with ordinality s(song,n);
insert into public.events(id,team_id,type,name,event_date,starts_at,created_by) values(message_send_test.id(16000),song_purge_test.team(),'service','Readiness event','2026-10-24','10:00',message_send_test.id(1));
insert into public.user_annotations(id,setlist_song_id,profile_id,canvas_data) select message_send_test.id(17000+n),c.id,message_send_test.id(2),'Private website annotation' from public.setlist_songs c join unnest(array[1000,1006])n on c.song_id=message_send_test.id(n);
insert into public.song_readiness(event_id,slot_id,team_member_id,state,note) select message_send_test.id(16000),c.id,message_send_test.id(13),'practicing','Private readiness note' from public.setlist_songs c where c.song_id in(message_send_test.id(1000),message_send_test.id(1006));
insert into public.song_favorites(song_id,team_member_id) select message_send_test.id(n),message_send_test.member() from unnest(array[1000,1006,1008])n;
insert into public.song_versions(id,song_id,version_number,lyrics_chords,changed_by) select message_send_test.id(5000+n),message_send_test.id(n),1,'Private version body',message_send_test.id(1) from unnest(array[1000,1006])n;
insert into public.song_edit_requests(id,song_id,proposed_title,submitted_by) select message_send_test.id(6000+n),message_send_test.id(n),'Private request title',message_send_test.id(2) from unnest(array[1000,1006])n;
insert into public.shared_edit_requests(id,team_id,target_type,target_id,base_revision,changes,before_snapshot,reason,requested_by,request_nonce,legacy_song_request_id) select message_send_test.id(7000+n),song_purge_test.team(),'song',message_send_test.id(n),1,'{}','{}','Private reason',message_send_test.id(2),message_send_test.id(8000+n),message_send_test.id(6000+n) from unnest(array[1000,1006])n;
insert into public.dance_notes(id,team_id,song_id,title,choreography_notes,created_by) select message_send_test.id(9000+n),song_purge_test.team(),message_send_test.id(n),'Private dance','Private dance body',message_send_test.id(2) from unnest(array[1000,1006])n;
insert into public.mobile_annotations(id,team_id,actor_id,song_id,notes) select message_send_test.id(10000+n),song_purge_test.team(),message_send_test.id(2),message_send_test.id(n),'[{"text":"Private annotation"}]' from unnest(array[1000,1006])n;
insert into public.practice_files(id,team_id,song_id,storage_path,file_name,mime_type,size_bytes,uploaded_by) select message_send_test.id(11000+n),song_purge_test.team(),message_send_test.id(n),song_purge_test.team()::text||'/purge/private-'||n||'.pdf','private.pdf','application/pdf',20,message_send_test.id(2) from unnest(array[1000,1006])n;
insert into storage.objects(id,bucket_id,name) select message_send_test.id(12000+n),'practice-files',song_purge_test.team()::text||'/purge/private-'||n||'.pdf' from unnest(array[1000,1006])n;
update public.songs set deleted_at='2026-10-24T04:05:06.654321Z' where id in(message_send_test.id(1000),message_send_test.id(1006),message_send_test.id(1008),message_send_test.id(1009),message_send_test.id(1013),message_send_test.id(1014));
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
insert into song_purge_test.pending values('original',song_purge_test.request(100)),('rollback',song_purge_test.request(108,1006)),('guard',song_purge_test.request(109,1008)),('race',song_purge_test.request(110,1009)),('child-race',song_purge_test.request(114,1014));
do $$declare review jsonb;begin review:=public.mobile_read_song_purge_state(song_purge_test.team(),message_send_test.member(),message_send_test.id(1000));assert review->>'status'='ready';assert review#>'{impact,counts}'='{"songs":1,"setlists":1,"setlistSlots":1,"favorites":1,"versions":1,"editRequests":1,"danceNotes":1,"annotations":2,"readinessResponses":1,"detachedPracticeFiles":1,"detachedLegacyRequests":1}'::jsonb,'Complete actual impact counts differ';assert review::text not like '%Private%','Private child body exposed';end$$;
select song_purge_test.capture('applied',(select request from song_purge_test.pending where name='original'));
do $$declare saved record;begin select * into saved from song_purge_test.cases where name='applied';assert saved.receipt->>'status'='applied','Full cascade blocked';assert public.mobile_purge_song(saved.request)=saved.receipt,'Retry proof differs';end$$;
reset role;
do $$begin
 assert not exists(select 1 from public.songs where id=message_send_test.id(1000));
 assert not exists(select 1 from public.setlist_songs where song_id=message_send_test.id(1000));assert not exists(select 1 from public.song_favorites where song_id=message_send_test.id(1000));assert not exists(select 1 from public.song_versions where song_id=message_send_test.id(1000));assert not exists(select 1 from public.song_edit_requests where song_id=message_send_test.id(1000));assert not exists(select 1 from public.dance_notes where song_id=message_send_test.id(1000));assert not exists(select 1 from public.mobile_annotations where song_id=message_send_test.id(1000));
 assert not exists(select 1 from public.user_annotations where id=message_send_test.id(18000));assert not exists(select 1 from public.song_readiness where slot_id=message_send_test.id(4001));
 assert exists(select 1 from public.practice_files where id=message_send_test.id(12000) and song_id is null),'Practice file not detached';
 assert exists(select 1 from storage.objects where id=message_send_test.id(13000)),'Storage was deleted';
 assert exists(select 1 from public.shared_edit_requests where id=message_send_test.id(8000) and legacy_song_request_id is null and target_id=message_send_test.id(1000)),'Shared request not retained/null linked';
 assert exists(select 1 from public.mobile_deleted_records where entity_type='song' and entity_id=message_send_test.id(1000));
end$$;
-- History cannot delete a UUID replacement or its newly attached slots.
select set_config('request.jwt.claim.sub','',false);
insert into public.songs(id,team_id,title,artist,original_key,bpm,lyrics_chords,created_by,created_at) values(message_send_test.id(1000),song_purge_test.team(),'UUID replacement','Artist','C',100,'Replacement retained',message_send_test.id(1),'2026-10-24T09:00:00Z');
insert into public.setlist_songs(id,setlist_id,song_id,song_order,assigned_key) values(message_send_test.id(4500),message_send_test.id(3001),message_send_test.id(1000),1,'C');
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
do $$declare saved record;begin select * into saved from song_purge_test.cases where name='applied';assert public.mobile_purge_song(saved.request)=saved.receipt;end$$;
select song_purge_test.denied(jsonb_set((select request from song_purge_test.pending where name='original'),'{impact,fingerprint}',to_jsonb(repeat('a',64))),'22023');
select song_purge_test.denied(jsonb_set(song_purge_test.request(115,1001),'{memberCreatedAt}','"2026-10-24T01:00:00Z"'),'42501');
select song_purge_test.denied(jsonb_set(song_purge_test.request(115,1001),'{base,teamId}',to_jsonb(message_send_test.id(9998))),'42501');
insert into song_purge_test.pending values('revision',song_purge_test.request(102,1001)),('deletion',song_purge_test.request(103,1002)),('replacement',song_purge_test.request(104,1003)),('active',song_purge_test.request(105,1004)),('impact',song_purge_test.request(113,1013)),('concurrent',song_purge_test.request(116,1007));
reset role;
select set_config('request.jwt.claim.sub','',false);
update public.songs set title='Newer Trash' where id=message_send_test.id(1001);
update public.songs set deleted_at='2026-10-24T05:00:00Z' where id=message_send_test.id(1002);
delete from public.songs where id=message_send_test.id(1003);
insert into public.songs(id,team_id,title,artist,original_key,bpm,lyrics_chords,created_by,created_at,deleted_at) values(message_send_test.id(1003),song_purge_test.team(),'Other replacement','Artist','C',100,'Replacement',message_send_test.id(1),'2026-10-24T06:00:00Z','2026-10-24T04:05:06.654321Z');
update public.songs set deleted_at=null where id=message_send_test.id(1004);
update public.setlist_songs set notes='Changed reviewed body' where song_id=message_send_test.id(1013);
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
select song_purge_test.capture('revision-conflict',(select request from song_purge_test.pending where name='revision'));
select song_purge_test.capture('deletion-conflict',(select request from song_purge_test.pending where name='deletion'));
select song_purge_test.capture('incarnation-conflict',(select request from song_purge_test.pending where name='replacement'));
select song_purge_test.capture('active-conflict',(select request from song_purge_test.pending where name='active'));
select song_purge_test.capture('impact-conflict',(select request from song_purge_test.pending where name='impact'));
select song_purge_test.capture('missing',jsonb_set(song_purge_test.request(117,1005),'{base,id}',to_jsonb(message_send_test.id(9999))));
do $$begin assert(public.mobile_read_song_purge_state(song_purge_test.team(),message_send_test.member(),message_send_test.id(1004))->>'status')='not-trashed';end$$;
reset role;
select set_config('request.jwt.claim.sub','',false);
delete from public.team_permission_overrides where member_id=message_send_test.member();
select set_config('request.jwt.claim.sub',message_send_test.id(2)::text,false);
set role authenticated;
select song_purge_test.denied(jsonb_set(jsonb_set((select request from song_purge_test.pending where name='original'),'{userId}',to_jsonb(auth.uid())),'{memberId}',to_jsonb(message_send_test.id(12))),'42501');
reset role;
select set_config('request.jwt.claim.sub','',false);
update public.team_members set role='admin' where id=message_send_test.id(12);
select set_config('request.jwt.claim.sub',message_send_test.id(2)::text,false);
set role authenticated;
select song_purge_test.capture('admin',song_purge_test.request(118,1005));
insert into song_purge_test.pending values('actual-child-guard',song_purge_test.request(119,1008));
reset role;
select set_config('request.jwt.claim.sub','',false);
insert into public.team_permission_overrides(team_id,member_id,permission,allowed) values(song_purge_test.team(),message_send_test.id(12),'setlists.manage',false);
create table song_purge_test.actual_guard_before as select song_purge_test.snapshot() value;
select set_config('request.jwt.claim.sub',message_send_test.id(2)::text,false);
set role authenticated;
select song_purge_test.capture('actual-child-guard',(select request from song_purge_test.pending where name='actual-child-guard'));
reset role;
do $$begin assert(select receipt->>'status'='related-records-blocked' from song_purge_test.cases where name='actual-child-guard');assert(select value=song_purge_test.snapshot() from song_purge_test.actual_guard_before),'Actual child override changed rows';end$$;
select set_config('request.jwt.claim.sub','',false);
delete from public.team_permission_overrides where member_id=message_send_test.id(12);
reset role;
select set_config('request.jwt.claim.sub','',false);
insert into public.team_permission_overrides(team_id,member_id,permission,allowed) values(song_purge_test.team(),message_send_test.id(12),'songs.edit',false);
select set_config('request.jwt.claim.sub',message_send_test.id(2)::text,false);
set role authenticated;
select song_purge_test.denied((select request from song_purge_test.cases where name='admin'),'42501');
reset role;
select set_config('request.jwt.claim.sub','',false);
delete from public.team_permission_overrides where member_id=message_send_test.id(12);

-- Even the same selected member UUID cannot reuse an earlier incarnation's proof.
delete from public.team_members where id=message_send_test.id(12);
insert into public.team_members(id,team_id,profile_id,role,status,created_at) values(message_send_test.id(12),song_purge_test.team(),message_send_test.id(2),'admin','active','2026-10-24T23:50:00Z');
select set_config('request.jwt.claim.sub',message_send_test.id(2)::text,false);
set role authenticated;
select song_purge_test.denied((select request from song_purge_test.cases where name='admin'),'42501');
reset role;
select set_config('request.jwt.claim.sub',message_send_test.id(3)::text,false);
set role authenticated;
select song_purge_test.denied((select request from song_purge_test.pending where name='original'),'42501');
reset role;
select set_config('request.jwt.claim.sub','',false);
-- A genuine foreign workspace plus anonymous requests cannot reuse history.
insert into public.teams(id,name,code,owner_id) values(message_send_test.id(9900),'Foreign team','FT-12345',message_send_test.id(3));
insert into public.team_members(id,team_id,profile_id,role,status) values(message_send_test.id(9901),message_send_test.id(9900),message_send_test.id(3),'owner','active');
select set_config('request.jwt.claim.sub',message_send_test.id(3)::text,false);
set role authenticated;
select song_purge_test.denied(jsonb_set(jsonb_set(jsonb_set((select request from song_purge_test.pending where name='original'),'{userId}',to_jsonb(auth.uid())),'{memberId}',to_jsonb(message_send_test.id(9901))),'{teamId}',to_jsonb(message_send_test.id(9900))),'42501');
reset role;
select set_config('request.jwt.claim.sub','',false);
select song_purge_test.denied((select request from song_purge_test.pending where name='original'),'42501');
-- Guard failure occurs after slot deletion and rolls the entire cascade back.
create function song_purge_test.block_child() returns trigger language plpgsql as $$begin if old.song_id=message_send_test.id(1008) then raise exception 'Private favorite guard' using errcode='42501';end if;return old;end$$;
create trigger song_purge_child_guard before delete on public.song_favorites for each row execute function song_purge_test.block_child();
create table song_purge_test.guard_before as select song_purge_test.snapshot() value;
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
select song_purge_test.capture('related-blocked',(select request from song_purge_test.pending where name='guard'));
reset role;
do $$begin assert(select value=song_purge_test.snapshot() from song_purge_test.guard_before),'Blocked child left cascade side effects';end$$;
drop trigger song_purge_child_guard on public.song_favorites;
-- Late receipt insertion failure must restore all FK rows and side effects.
create function song_purge_test.fail_late() returns trigger language plpgsql as $$begin if new.request_nonce=message_send_test.id(108) then raise exception 'Synthetic purge ledger failure';end if;return new;end$$;
create trigger song_purge_late before insert on private.mobile_song_purge_receipts for each row execute function song_purge_test.fail_late();
create table song_purge_test.before_rollback as select song_purge_test.snapshot() value;
set role authenticated;
select song_purge_test.denied((select request from song_purge_test.pending where name='rollback'),'P0001');
reset role;
do $$begin assert(select value=song_purge_test.snapshot() from song_purge_test.before_rollback),'Late failure changed rows/parent revision/sync/tombstones/Storage';assert not exists(select 1 from private.mobile_song_purge_receipts where request_nonce=message_send_test.id(108));end$$;
drop trigger song_purge_late on private.mobile_song_purge_receipts;
-- Foreign legacy file links are blocked without leaking counts or bodies.
select set_config('request.jwt.claim.sub','',false);
insert into public.practice_files(id,team_id,song_id,storage_path,file_name,mime_type,size_bytes,uploaded_by) values(message_send_test.id(15000),message_send_test.id(9900),message_send_test.id(1010),message_send_test.id(9900)::text||'/foreign/private.pdf','Foreign private.pdf','application/pdf',20,message_send_test.id(3));
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
set role authenticated;
do $$declare state jsonb;begin state:=public.mobile_read_song_purge_state(song_purge_test.team(),message_send_test.member(),message_send_test.id(1010));assert state->>'status'='related-records-blocked' and state->'impact'='null'::jsonb;assert state::text not like '%Foreign%';end$$;
reset role;
-- Oversize reviews never return a partial fingerprint/count set.
insert into public.song_versions(song_id,version_number,lyrics_chords,changed_by) select message_send_test.id(1011),n,'private',message_send_test.id(1) from generate_series(1,2001)n;
set role authenticated;
do $$declare state jsonb;begin state:=public.mobile_read_song_purge_state(song_purge_test.team(),message_send_test.member(),message_send_test.id(1011));assert state->>'status'='impact-too-large' and state->'impact'='null'::jsonb;end$$;
reset role;
do $$begin
 assert exists(select 1 from public.songs where id=message_send_test.id(1000) and lyrics_chords='Replacement retained'),'History deleted replacement';assert exists(select 1 from public.setlist_songs where id=message_send_test.id(4500)),'History deleted replacement link';
 assert(select bool_and(receipt->>'status'='conflict') from song_purge_test.cases where name like '%conflict');
 assert(select receipt->>'status'='related-records-blocked' from song_purge_test.cases where name='related-blocked');
 assert not exists(select 1 from pg_constraint where conrelid='private.mobile_song_purge_receipts'::regclass and contype='f'),'History has FK';
 begin update private.mobile_song_purge_receipts set result='{}';raise exception 'Receipt update unexpectedly allowed';exception when insufficient_privilege then null;end;
 begin delete from private.mobile_song_purge_receipts;raise exception 'Receipt deletion unexpectedly allowed';exception when insufficient_privilege then null;end;
end$$;






