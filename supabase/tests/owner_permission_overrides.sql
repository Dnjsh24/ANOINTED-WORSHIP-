-- Run only inside the isolated migration-chain PostgreSQL runner.
reset role;
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000101','permission-owner-a@example.test'),
 ('00000000-0000-0000-0000-000000000102','permission-member-a@example.test'),
 ('00000000-0000-0000-0000-000000000103','permission-owner-b@example.test'),
 ('00000000-0000-0000-0000-000000000104','permission-admin-a@example.test'),
 ('00000000-0000-0000-0000-000000000105','permission-inactive-a@example.test'),
 ('00000000-0000-0000-0000-000000000106','permission-applicant@example.test');
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$
declare affected bigint;
begin
  begin execute statement;
    get diagnostics affected = row_count;
    if statement ~* '^(update|delete)' and affected=0 then return; end if;
  exception when insufficient_privilege then return; end;
  raise exception 'Expected permission denial: %',statement;
end $$;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select set_config('test.team_a',team_id::text,false),set_config('test.owner_member',team_member_id::text,false)
 from public.create_team_workspace('Permission Team A','PA-12345');
insert into public.team_members(team_id,profile_id,role,status) values
 (current_setting('test.team_a')::uuid,'00000000-0000-0000-0000-000000000102','member','active'),
 (current_setting('test.team_a')::uuid,'00000000-0000-0000-0000-000000000104','admin','active'),
 (current_setting('test.team_a')::uuid,'00000000-0000-0000-0000-000000000105','admin','inactive');
select set_config('test.member_a',id::text,false) from public.team_members where profile_id='00000000-0000-0000-0000-000000000102';
select set_config('test.admin_a',id::text,false) from public.team_members where profile_id='00000000-0000-0000-0000-000000000104';
select set_config('test.event_a',public.save_event_workspace(current_setting('test.team_a')::uuid,null,
 '{"name":"Permission service","type":"service","event_date":"2027-02-01","starts_at":"09:00","ends_at":"11:00","recurrence_rule":"none"}',
 '[]',null)::text,false);
insert into public.songs(team_id,title,artist,original_key,lyrics_chords,created_by)
 values(current_setting('test.team_a')::uuid,'Owner song','Artist','C','Verse',auth.uid());
select set_config('test.song_a',id::text,false) from public.songs where title='Owner song';
select public.set_team_permission_override(current_setting('test.team_a')::uuid,'admin',null,'setlists.manage',false);
select pg_temp.expect_denied(format('select public.set_team_permission_override(%L,%L,null,%L,false)',current_setting('test.team_a'),'owner','setlists.manage'));
select pg_temp.expect_denied(format('select public.set_team_permission_override(%L,null,%L,%L,false)',current_setting('test.team_a'),current_setting('test.owner_member'),'setlists.manage'));
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000104';
select pg_temp.expect_denied(format('select public.set_team_permission_override(%L,%L,null,%L,true)',current_setting('test.team_a'),'member','team.manage'));
select pg_temp.expect_denied(format('update public.team_settings set default_service_location=''Denied default'' where team_id=%L',current_setting('test.team_a')));
select pg_temp.expect_denied(format('select public.save_setlist_workspace(%L,null,%L,%L,''{}''::uuid[],null,null)',current_setting('test.team_a'),current_setting('test.event_a'),'{"name":"Denied","event_type":"service","setlist_date":"2027-02-01","update_event":false}'));
select pg_temp.expect_denied(format('insert into public.team_permission_overrides(team_id,role,permission,allowed) values(%L,''member'',''team.manage'',true)',current_setting('test.team_a')));
select pg_temp.expect_denied(format('insert into public.custom_roles(team_id,name,permissions) values(%L,''Escalated'',array[''team.manage''])',current_setting('test.team_a')));
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select public.set_team_permission_override(current_setting('test.team_a')::uuid,'admin',null,'team.manage',true);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000104';
update public.team_settings set default_service_location='Granted default' where team_id=current_setting('test.team_a')::uuid;
do $$ begin if not exists(select 1 from public.team_settings where team_id=current_setting('test.team_a')::uuid and default_service_location='Granted default') then raise exception 'Settings grant failed'; end if; end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select public.set_team_permission_override(current_setting('test.team_a')::uuid,'admin',null,'team.manage',null);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000104';
select pg_temp.expect_denied(format('update public.team_settings set default_service_location=''Denied reset'' where team_id=%L',current_setting('test.team_a')));
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.admin_a')::uuid,'setlists.manage',true);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000104';
select public.save_setlist_workspace(current_setting('test.team_a')::uuid,null,current_setting('test.event_a')::uuid,
 '{"name":"Person allow wins","event_type":"service","setlist_date":"2027-02-01","update_event":false}','{}'::uuid[],null,null);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.admin_a')::uuid,'setlists.manage',null);
select public.set_team_permission_override(current_setting('test.team_a')::uuid,'member',null,'songs.create',false);
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.member_a')::uuid,'songs.edit',true);
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.member_a')::uuid,'events.manage',true);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000102';
select pg_temp.expect_denied(format('insert into public.songs(team_id,title,artist,original_key,lyrics_chords,created_by) values(%L,''Denied song'',''Artist'',''C'',''Verse'',auth.uid())',current_setting('test.team_a')));
update public.songs set lyrics_chords='Delegated edit' where id=current_setting('test.song_a')::uuid;
do $$ begin if (select lyrics_chords from public.songs where id=current_setting('test.song_a')::uuid)<>'Delegated edit' then raise exception 'Person song editing grant failed'; end if; end $$;
select public.save_event_workspace(current_setting('test.team_a')::uuid,current_setting('test.event_a')::uuid,
 '{"name":"Delegated service","type":"service","event_date":"2027-02-01","starts_at":"09:00","ends_at":"11:00","recurrence_rule":"none"}','[]',null,(select sync_revision from public.events where id=current_setting('test.event_a')::uuid));
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.member_a')::uuid,'songs.edit',false);
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.member_a')::uuid,'events.manage',false);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000102';
select pg_temp.expect_denied(format('update public.songs set lyrics_chords=''Denied edit'' where id=%L',current_setting('test.song_a')));
select pg_temp.expect_denied(format('select public.save_event_workspace(%L,%L,%L,''[]'',null)',current_setting('test.team_a'),current_setting('test.event_a'),'{"name":"Denied service","type":"service","event_date":"2027-02-01","starts_at":"09:00","recurrence_rule":"none"}'));
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000103';
select set_config('test.team_b',team_id::text,false) from public.create_team_workspace('Permission Team B','PB-12345');
insert into public.join_requests(team_id,profile_id,requested_role,status) values(current_setting('test.team_a')::uuid,auth.uid(),'member','pending');
select set_config('test.join_request',id::text,false) from public.join_requests where profile_id=auth.uid() and team_id=current_setting('test.team_a')::uuid;
select pg_temp.expect_denied(format('select public.set_team_permission_override(%L,''member'',null,''team.manage'',true)',current_setting('test.team_a')));
do $$ begin if exists(select 1 from public.team_permission_overrides where team_id=current_setting('test.team_a')::uuid) then raise exception 'Cross-team permission reads leaked'; end if; end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select pg_temp.expect_denied(format('select public.set_team_permission_override(%L,null,%L,''team.manage'',true)',current_setting('test.team_b'),current_setting('test.member_a')));
select public.set_team_permission_override(current_setting('test.team_a')::uuid,'admin',null,'members.manage',false);
select public.set_team_permission_override(current_setting('test.team_a')::uuid,'admin',null,'team.manage',true);
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.member_a')::uuid,'members.manage',true);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000106';
insert into public.join_requests(team_id,profile_id,requested_role,status) values(current_setting('test.team_a')::uuid,auth.uid(),'worship_leader','pending');
select set_config('test.leader_request',id::text,false) from public.join_requests where profile_id=auth.uid() and team_id=current_setting('test.team_a')::uuid;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000104';
select pg_temp.expect_denied(format('select public.review_join_request(%L,''approved'')',current_setting('test.join_request')));
select pg_temp.expect_denied(format('update public.teams set code=''PA-99990'' where id=%L',current_setting('test.team_a')));
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000102';
update public.teams set code='PA-99991' where id=current_setting('test.team_a')::uuid;
do $$ begin if not exists(select 1 from public.teams where id=current_setting('test.team_a')::uuid and code='PA-99991') then raise exception 'Delegated code update failed'; end if; end $$;
do $$ begin
 if not exists(select 1 from public.join_requests where id=current_setting('test.join_request')::uuid) then raise exception 'Delegated join manager cannot read pending requests'; end if;
 if not exists(select 1 from public.profiles where id='00000000-0000-0000-0000-000000000103') then raise exception 'Delegated join manager cannot read requester profile'; end if;
end $$;
select pg_temp.expect_denied(format('update public.team_members set role=''admin'' where id=%L',current_setting('test.member_a')));
select pg_temp.expect_denied(format('update public.team_members set role=''worship_leader'' where id=%L',current_setting('test.member_a')));
select pg_temp.expect_denied(format('update public.team_members set role=''member'' where id=%L',current_setting('test.admin_a')));
select pg_temp.expect_denied(format('delete from public.team_members where id=%L',current_setting('test.admin_a')));
select pg_temp.expect_denied(format('insert into public.team_invitations(team_id,email,role,invited_by) values(%L,''privileged@example.test'',''admin'',auth.uid())',current_setting('test.team_a')));
select pg_temp.expect_denied(format('insert into public.team_invitations(team_id,email,role,invited_by) values(%L,''owner@example.test'',''owner'',auth.uid())',current_setting('test.team_a')));
select pg_temp.expect_denied(format('insert into public.team_invitations(team_id,email,role,invited_by) values(%L,''leader@example.test'',''worship_leader'',auth.uid())',current_setting('test.team_a')));
select pg_temp.expect_denied(format('insert into public.team_members(team_id,profile_id,role,status) values(%L,''00000000-0000-0000-0000-000000000106'',''worship_leader'',''active'')',current_setting('test.team_a')));
select pg_temp.expect_denied(format('select public.review_join_request(%L,''approved'')',current_setting('test.leader_request')));
insert into public.team_invitations(team_id,email,role,invited_by) values(current_setting('test.team_a')::uuid,'ordinary@example.test','member',auth.uid());
select pg_temp.expect_denied(format('update public.team_invitations set role=''worship_leader'' where team_id=%L and email=''ordinary@example.test''',current_setting('test.team_a')));
update public.team_members set ministry='Updated by delegated manager' where id=current_setting('test.member_a')::uuid;
do $$ begin if not exists(select 1 from public.team_members where id=current_setting('test.member_a')::uuid and ministry='Updated by delegated manager' and role='member') then raise exception 'Safe delegated roster update failed'; end if; end $$;
select public.review_join_request(current_setting('test.join_request')::uuid,'rejected');
select pg_temp.expect_denied(format('insert into storage.objects(bucket_id,name) values(''practice-files'',%L)',current_setting('test.team_a')||'/'||auth.uid()||'/default-denied.pdf'));
select pg_temp.expect_denied(format('insert into public.practice_files(team_id,storage_path,file_name,mime_type,size_bytes,uploaded_by) values(%L,%L,''default-denied.pdf'',''application/pdf'',100,%L)',current_setting('test.team_a'),current_setting('test.team_a')||'/'||auth.uid()||'/default-denied.pdf',auth.uid()));
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select public.review_join_request(current_setting('test.leader_request')::uuid,'approved');
select public.set_team_permission_override(current_setting('test.team_a')::uuid,'member',null,'files.upload',true);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000102';
insert into storage.objects(bucket_id,name) values('practice-files',current_setting('test.team_a')||'/'||auth.uid()||'/inherited.pdf');
update storage.objects set name=current_setting('test.team_a')||'/'||auth.uid()||'/inherited-replaced.pdf' where bucket_id='practice-files' and name=current_setting('test.team_a')||'/'||auth.uid()||'/inherited.pdf';
do $$ begin if not exists(select 1 from storage.objects where name=current_setting('test.team_a')||'/'||auth.uid()||'/inherited-replaced.pdf') then raise exception 'Inherited upload permission failed'; end if; end $$;
delete from storage.objects where bucket_id='practice-files' and name=current_setting('test.team_a')||'/'||auth.uid()||'/inherited-replaced.pdf';
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.member_a')::uuid,'files.upload',true);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000102';
insert into storage.objects(bucket_id,name) values('practice-files',current_setting('test.team_a')||'/'||auth.uid()||'/grant.pdf'),('presentation-media',current_setting('test.team_a')||'/'||auth.uid()||'/grant.png');
insert into public.practice_files(team_id,storage_path,file_name,mime_type,size_bytes,uploaded_by)
 values(current_setting('test.team_a')::uuid,current_setting('test.team_a')||'/'||auth.uid()||'/grant.pdf','grant.pdf','application/pdf',100,auth.uid());
update storage.objects set name=current_setting('test.team_a')||'/'||auth.uid()||'/replacement.pdf' where bucket_id='practice-files' and name=current_setting('test.team_a')||'/'||auth.uid()||'/grant.pdf';
update storage.objects set name=current_setting('test.team_a')||'/'||auth.uid()||'/replacement.png' where bucket_id='presentation-media' and name=current_setting('test.team_a')||'/'||auth.uid()||'/grant.png';
update public.practice_files set file_name='renamed.pdf' where team_id=current_setting('test.team_a')::uuid;
do $$ begin
 if (select count(*) from storage.objects where name like current_setting('test.team_a')||'/%/replacement.%')<>2 then raise exception 'Delegated storage replacement failed'; end if;
 if not exists(select 1 from public.practice_files where team_id=current_setting('test.team_a')::uuid and file_name='renamed.pdf') then raise exception 'Delegated attachment metadata update failed'; end if;
end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.member_a')::uuid,'files.upload',false);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000102';
select pg_temp.expect_denied(format('insert into storage.objects(bucket_id,name) values(''practice-files'',%L)',current_setting('test.team_a')||'/'||auth.uid()||'/denied.pdf'));
select pg_temp.expect_denied(format('insert into storage.objects(bucket_id,name) values(''presentation-media'',%L)',current_setting('test.team_a')||'/'||auth.uid()||'/denied.png'));
select pg_temp.expect_denied(format('update storage.objects set name=%L where bucket_id=''practice-files'' and name=%L',current_setting('test.team_a')||'/'||auth.uid()||'/denied.pdf',current_setting('test.team_a')||'/'||auth.uid()||'/replacement.pdf'));
select pg_temp.expect_denied(format('update storage.objects set name=%L where bucket_id=''presentation-media'' and name=%L',current_setting('test.team_a')||'/'||auth.uid()||'/denied.png',current_setting('test.team_a')||'/'||auth.uid()||'/replacement.png'));
select pg_temp.expect_denied(format('update public.practice_files set file_name=''denied.pdf'' where team_id=%L',current_setting('test.team_a')));
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000101';
insert into public.custom_roles(team_id,name,permissions) values(current_setting('test.team_a')::uuid,'Uploader legacy editor',array['files.upload','songs.edit']);
update public.team_members set custom_role_id=(select id from public.custom_roles where team_id=current_setting('test.team_a')::uuid and name='Uploader legacy editor') where id=current_setting('test.member_a')::uuid;
select public.set_team_permission_override(current_setting('test.team_a')::uuid,'member',null,'files.upload',null);
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.member_a')::uuid,'files.upload',null);
select public.set_team_permission_override(current_setting('test.team_a')::uuid,null,current_setting('test.member_a')::uuid,'songs.edit',null);
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000102';
do $$ begin if not private.has_team_permission(current_setting('test.team_a')::uuid,'files.upload') or private.has_team_permission(current_setting('test.team_a')::uuid,'songs.edit') then raise exception 'Custom permission parity failed'; end if; end $$;
insert into storage.objects(bucket_id,name) values('practice-files',current_setting('test.team_a')||'/'||auth.uid()||'/custom-role.pdf');
select pg_temp.expect_denied(format('update public.songs set lyrics_chords=''Custom role bypass'' where id=%L',current_setting('test.song_a')));
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000105';
select pg_temp.expect_denied(format('select public.set_team_permission_override(%L,''member'',null,''team.manage'',true)',current_setting('test.team_a')));
reset role;
set role anon;
set request.jwt.claim.sub='';
select pg_temp.expect_denied(format('select public.set_team_permission_override(%L,''member'',null,''team.manage'',true)',current_setting('test.team_a')));
select pg_temp.expect_denied('select * from public.team_permission_overrides');
reset role;
do $$ begin if (select count(*) from public.activity_logs where team_id=current_setting('test.team_a')::uuid and action='changed permission')<8 then raise exception 'Permission audit events missing'; end if; end $$;
\echo PASS owner permission overrides: role denial, person precedence/reset, delegated song/event writes, revoked writes, owner lockout protection, owner-only custom roles, inactive/anonymous/cross-team denial and audit events
