\set ON_ERROR_STOP on
-- Synthetic isolated PostgreSQL verification only; never hosted data.
create schema dance_test;
create function dance_test.id(n integer) returns uuid language sql immutable as $$select ('98000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table dance_test.ids(key text primary key,id uuid not null);
create table dance_test.cases(name text primary key,kind text not null,payload jsonb not null);
grant usage on schema dance_test to authenticated;
grant select,insert on dance_test.ids,dance_test.cases to authenticated;
insert into auth.users(id,email) values(dance_test.id(1),'dance-owner@example.test'),(dance_test.id(2),'dance-other@example.test'),(dance_test.id(3),'dance-member@example.test'),(dance_test.id(4),'dance-dancer@example.test');
select set_config('request.jwt.claim.sub',dance_test.id(1)::text,false);
insert into dance_test.ids select 'team',team_id from public.create_team_workspace('Dance A','DA-61021');
select set_config('request.jwt.claim.sub',dance_test.id(2)::text,false);
insert into dance_test.ids select 'other-team',team_id from public.create_team_workspace('Dance B','DB-61021');
insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by,status) select dance_test.id(12),id,'Other song','Choir','C','Lyrics',auth.uid(),'approved' from dance_test.ids where key='other-team';
select set_config('request.jwt.claim.sub',dance_test.id(1)::text,false);
insert into public.team_members(team_id,profile_id,role,status) select id,dance_test.id(3),'member','active' from dance_test.ids where key='team';
insert into public.team_members(team_id,profile_id,role,status) select id,dance_test.id(4),'dancer','active' from dance_test.ids where key='team';
insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by,status) select dance_test.id(10),id,'Linked song','Choir','C','Lyrics',auth.uid(),'approved' from dance_test.ids where key='team';
insert into public.events(id,team_id,name,type,event_date,starts_at,created_by,approval_status) select dance_test.id(11),id,'Service','service','2026-10-25','09:00',auth.uid(),'approved' from dance_test.ids where key='team';
create function dance_test.team() returns uuid language sql stable as $$select id from dance_test.ids where key='team'$$;
create function dance_test.value() returns jsonb language sql immutable as $$select '{"title":"Standalone custom chart","song_id":null,"event_id":null,"choreography_notes":"Verse: step right","formation_notes":"Two lines","outfit_notes":"Purple sash","song_title":"Custom song","song_artist":"Choir","song_version":"Live","video_url":"https://example.test/video"}'::jsonb$$;
create function dance_test.command(n integer,value jsonb,base jsonb default null) returns jsonb language sql as $$select jsonb_build_object('commandId',gen_random_uuid(),'entityType','dance','entityId',dance_test.id(n),'baseRevision',coalesce(base->'revision','0'::jsonb),'baseValue',coalesce(base->'value','null'::jsonb),'value',value)$$;
create function dance_test.capture(label text,command jsonb) returns jsonb language plpgsql as $$declare response jsonb;begin
 response:=public.mobile_apply_command(dance_test.team(),command); insert into dance_test.cases values(label,'receipt',response);return response;end$$;
create function dance_test.denied(command jsonb,expected text) returns void language plpgsql as $$declare denied boolean:=false;begin
 begin perform public.mobile_apply_command(dance_test.team(),command);exception when others then if sqlstate=expected then denied:=true;else raise;end if;end;
 assert denied,'Expected Dance rejection '||expected;end$$;
set role authenticated;
do $$declare command jsonb;first jsonb;result jsonb;base jsonb;page jsonb;value jsonb;begin
 command:=dance_test.command(20,dance_test.value());first:=dance_test.capture('standalone-create',command);
 assert first->>'status'='applied' and first->'record'->'value'=dance_test.value(),'Full standalone fields were lost';
 assert public.mobile_apply_command(dance_test.team(),command)=first,'Exact create retry changed result';
 perform dance_test.denied(jsonb_set(command,'{value,title}','"Different retry"'),'22023');
 value:=dance_test.value()||jsonb_build_object('song_id',dance_test.id(10),'event_id',dance_test.id(11));
 result:=dance_test.capture('linked-create',dance_test.command(21,value));
 page:=public.mobile_download_page(dance_test.team(),'{"kind":"library"}');
 assert (select count(*)=2 from jsonb_array_elements(page->'records') r where r->>'entityType'='dance'),'Library omitted standalone custom chart';
 assert not exists(select 1 from jsonb_array_elements(page->'records') r where r->>'id'=dance_test.id(12)::text),'Other-team song leaked';
 insert into dance_test.cases values('owner-library','download',page);
 page:=public.mobile_download_page(dance_test.team(),jsonb_build_object('kind','song','id',dance_test.id(10)));
 assert (select count(*)=1 from jsonb_array_elements(page->'records') r where r->>'entityType'='dance'),'Song selection pulled standalone chart';
 insert into dance_test.cases values('song-graph','download',page);
 base:=result->'record';
 perform dance_test.denied(dance_test.command(21,value||'{"song_id":null}',base),'22023');
 perform dance_test.denied(dance_test.command(22,value||jsonb_build_object('song_id',dance_test.id(12))),'42501');
 -- Independent website and offline edits merge against an authenticated base.
 update public.dance_notes set formation_notes='Circle' where id=dance_test.id(21);
 command:=dance_test.command(21,value||'{"choreography_notes":"Chorus: turn left"}',base);
 result:=dance_test.capture('independent-merge',command);
 assert result->'record'->'value'->>'formation_notes'='Circle' and result->'record'->'value'->>'choreography_notes'='Chorus: turn left','Independent Dance fields lost';
 base:=result->'record'; update public.dance_notes set outfit_notes='White sash' where id=dance_test.id(21);
 command:=dance_test.command(21,base->'value'||'{"outfit_notes":"Blue sash"}',base);
 result:=dance_test.capture('overlap-conflict',command);
 assert result->>'status'='conflict' and result->'fields'='["outfit_notes"]'::jsonb,'Overlapping Dance change was accepted';
 assert public.mobile_apply_command(dance_test.team(),command)=result,'Conflict exact retry changed result';
end$$;
select set_config('request.jwt.claim.sub',dance_test.id(3)::text,false);
do $$declare page jsonb;base jsonb;begin
 page:=public.mobile_download_page(dance_test.team(),'{"kind":"library"}');
 assert (select count(*)=2 from jsonb_array_elements(page->'records') r where r->>'entityType'='dance'),'Member cannot read charts';
 insert into dance_test.cases values('member-library','download',page);
 select r into base from jsonb_array_elements(page->'records') r where r->>'id'=dance_test.id(20)::text;
 perform dance_test.denied(dance_test.command(23,dance_test.value()),'42501');
 perform dance_test.denied(dance_test.command(20,dance_test.value()||'{"title":"Member bypass"}',base),'42501');
end$$;
select set_config('request.jwt.claim.sub',dance_test.id(4)::text,false);
do $$declare result jsonb;command jsonb;base jsonb;begin
 command:=dance_test.command(24,dance_test.value());result:=dance_test.capture('dancer-create',command);
 assert result->>'status'='applied','Dancer creation permission lost';base:=result->'record';
 perform dance_test.denied(dance_test.command(24,dance_test.value()||'{"title":"Dancer bypass"}',base),'42501');
 perform dance_test.denied(dance_test.command(24,dance_test.value(),base)||'{"operation":"delete"}','42501');
end$$;
select set_config('request.jwt.claim.sub',dance_test.id(2)::text,false);
do $$declare denied boolean:=false;begin
 begin perform public.mobile_download_page(dance_test.team(),'{"kind":"library"}');exception when insufficient_privilege then denied:=true;end;
 assert denied,'Other team read Dance library';
 perform dance_test.denied(dance_test.command(20,dance_test.value()),'42501');
end$$;
select set_config('request.jwt.claim.sub',dance_test.id(1)::text,false);
do $$declare page jsonb;base jsonb;command jsonb;result jsonb;begin
 page:=public.mobile_download_page(dance_test.team(),'{"kind":"library"}');
 select r into base from jsonb_array_elements(page->'records') r where r->>'id'=dance_test.id(20)::text;
 command:=dance_test.command(20,base->'value',base)||'{"operation":"delete"}';result:=dance_test.capture('reviewer-delete',command);
 assert result->'record'->>'deleted'='true','Reviewer delete was not a tombstone';
 assert public.mobile_apply_command(dance_test.team(),command)=result,'Delete retry changed receipt';
 page:=public.mobile_download_page(dance_test.team(),'{"kind":"library"}');
 assert exists(select 1 from jsonb_array_elements(page->'records') r where r->>'id'=dance_test.id(20)::text and r->>'deleted'='true'),'Library deletion omitted tombstone';
 insert into dance_test.cases values('library-after-delete','download',page);
end$$;
reset role;
select set_config('request.jwt.claim.sub',dance_test.id(1)::text,false);
update public.team_members set status='inactive' where profile_id=dance_test.id(4) and team_id=dance_test.team();
set role authenticated;
select set_config('request.jwt.claim.sub',dance_test.id(4)::text,false);
do $$declare denied boolean:=false;begin
 begin perform public.mobile_download_page(dance_test.team(),'{"kind":"library"}');exception when insufficient_privilege then denied:=true;end;
 assert denied,'Inactive member read charts';
end$$;
reset role;
select 'PASS full Dance fields, frozen library, exact retries, merge/conflict, roles, links, tenant and revoked access';
