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
insert into public.message_channel_members(channel_id,team_member_id) values(message_send_test.channel(),message_send_test.id(12));
create schema upload_test;
create table upload_test.cases(name text primary key,request jsonb not null,receipt jsonb not null);
create table upload_test.pending(name text primary key,request jsonb not null);
grant usage on schema upload_test to authenticated;
grant select,insert on all tables in schema upload_test to authenticated;
create function upload_test.request(n integer) returns jsonb language sql stable as $$select jsonb_build_object('version',2,'userId',auth.uid(),'teamId',tm.team_id,'memberId',tm.id,'memberCreatedAt',tm.created_at,'channelId',message_send_test.channel(),'requestNonce',message_send_test.id(n),'body',E'  Exact caption\n','file',jsonb_build_object('id',message_send_test.id(n+1000),'fileName','Notes.pdf','mimeType','application/pdf','sizeBytes',9,'sha256','3c87d37f1dbea6909f917ce437c390fb8e655a774387d9e69301c0b2283d5b63')) from public.team_members tm where profile_id=auth.uid()$$;
create function upload_test.path(request jsonb) returns text language sql immutable as $$select request->>'teamId'||'/messages/'||(request->>'userId')||'/'||(request->>'requestNonce')||'/'||(request#>>'{file,id}')||'.pdf'$$;
create function upload_test.object(request jsonb) returns void language sql as $$insert into storage.objects(bucket_id,name,owner,metadata) values('practice-files',upload_test.path(request),(request->>'userId')::uuid,jsonb_build_object('size',9,'mimetype','application/pdf'))$$;
create function upload_test.capture(label text,request jsonb) returns jsonb language plpgsql as $$declare receipt jsonb;begin receipt:=public.mobile_finalize_message_attachment(request);insert into upload_test.cases values(label,request,receipt);return receipt;end$$;
create function upload_test.denied(request jsonb,expected text) returns void language plpgsql as $$declare rejected boolean:=false;begin begin perform public.mobile_finalize_message_attachment(request);exception when others then if sqlstate=expected then rejected:=true;else raise;end if;end;assert rejected,'Expected upload finalize denial';end$$;
select upload_test.object(upload_test.request(100));
set role authenticated;
select upload_test.capture('original',upload_test.request(100));
select upload_test.capture('retry',upload_test.request(100));
do $$begin assert(select count(distinct receipt#>>'{message,id}')=1 from upload_test.cases),'Retry duplicated attachment message';end$$;
select upload_test.denied(jsonb_set(upload_test.request(100),'{body}','"Changed caption"'),'22023');
select upload_test.denied(upload_test.request(101),'42501');
reset role;
-- Simulated unknown metadata-insert reply: exact original file row exists,
-- while message/history have not yet been committed.
select upload_test.object(upload_test.request(102));
insert into public.practice_files(id,team_id,storage_path,file_name,mime_type,size_bytes,uploaded_by) select(r#>>'{file,id}')::uuid,(r->>'teamId')::uuid,upload_test.path(r),r#>>'{file,fileName}',r#>>'{file,mimeType}',(r#>>'{file,sizeBytes}')::bigint,(r->>'userId')::uuid from(select upload_test.request(102) r)s;
set role authenticated;
select upload_test.capture('partial-file-recovery',upload_test.request(102));
reset role;
create function upload_test.fail_late() returns trigger language plpgsql as $$begin if new.request_nonce=message_send_test.id(103) then raise exception 'Synthetic upload receipt failure';end if;return new;end$$;
create trigger upload_late before insert on private.mobile_message_attachment_receipts for each row execute function upload_test.fail_late();
select upload_test.object(upload_test.request(103));
set role authenticated;
select upload_test.denied(upload_test.request(103),'P0001');
reset role;
do $$begin assert not exists(select 1 from public.practice_files where id=message_send_test.id(1103)) and not exists(select 1 from public.messages where client_nonce=message_send_test.id(103)),'Late history failed to rollback metadata/message';assert exists(select 1 from storage.objects where name=upload_test.path(upload_test.request(103))),'Remote object was deleted';end$$;
drop trigger upload_late on private.mobile_message_attachment_receipts;
-- Current permissions are checked before immutable replay.
select set_config('request.jwt.claim.sub',message_send_test.id(2)::text,false);
set role authenticated;
select upload_test.denied(upload_test.request(104),'42501');
select upload_test.denied((select request from upload_test.cases where name='original'),'42501');
reset role;
select set_config('request.jwt.claim.sub',message_send_test.id(1)::text,false);
insert into upload_test.pending values('original',(select request from upload_test.cases where name='original'));
delete from public.messages where client_nonce=message_send_test.id(100);
delete from public.practice_files where id=message_send_test.id(1100);
set role authenticated;
do $$declare saved record;begin select * into saved from upload_test.cases where name='original';assert public.mobile_finalize_message_attachment(saved.request)=saved.receipt,'Deleted result history changed';assert not exists(select 1 from public.messages where client_nonce=message_send_test.id(100)) and not exists(select 1 from public.practice_files where id=message_send_test.id(1100)),'History recreated deleted file/message';end$$;
reset role;
-- Exact concurrent finalize begins after object upload proof in the API.
select upload_test.object(upload_test.request(105));


