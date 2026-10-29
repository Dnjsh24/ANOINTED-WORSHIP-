\set ON_ERROR_STOP on
-- Synthetic disposable PostgreSQL fixture only. Never run against a hosted database.
create schema template_test;
create function template_test.id(n integer) returns uuid language sql immutable as $$select ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create table template_test.ids(key text primary key,id uuid not null);
create table template_test.cases(name text primary key,identity jsonb not null,command jsonb not null,result jsonb not null);
create table template_test.race(command jsonb not null);
create table template_test.race_results(value jsonb not null);
grant usage on schema template_test to authenticated;
grant select on template_test.ids,template_test.race to authenticated;
grant insert,select on template_test.race_results to authenticated;
insert into auth.users(id,email) values(template_test.id(1),'template-owner-a@example.test'),(template_test.id(2),'template-owner-b@example.test'),(template_test.id(3),'template-member@example.test');
select set_config('request.jwt.claim.sub',template_test.id(1)::text,false);
insert into template_test.ids select 'teamA',team_id from public.create_team_workspace('Template A','TA-61019');
select set_config('request.jwt.claim.sub',template_test.id(2)::text,false);
insert into template_test.ids select 'teamB',team_id from public.create_team_workspace('Template B','TB-61019');
select set_config('request.jwt.claim.sub',template_test.id(1)::text,false);
insert into public.team_members(team_id,profile_id,role,status) select id,template_test.id(3),'member','active' from template_test.ids where key='teamA';
insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by,status)
 select template_test.id(10),id,'Repeated title','Artist','G','Song',template_test.id(1),'approved' from template_test.ids where key='teamA';
create function template_test.identity() returns jsonb language sql stable as $$
 select jsonb_build_object('userId',auth.uid(),'teamId',team_id,'memberId',id) from public.team_members
 where profile_id=auth.uid() and team_id=(select id from template_test.ids where key='teamA') and status='active';
$$;
create function template_test.create_command(n integer,target integer default null) returns jsonb language sql stable as $$
 select jsonb_build_object('commandId',template_test.id(n),'templateId',template_test.id(coalesce(target,n+1000)),
 'type','template.create','dependsOn','[]'::jsonb,'sourceBase',private.mobile_setlist_snapshot(team_id,(select id from template_test.ids where key='source')),
 'sourceSongs',private.mobile_template_source_songs(team_id,(select id from template_test.ids where key='source')),
 'value',jsonb_build_object('name','Sunday pattern','description','Keep description')) from public.team_members
 where id=(template_test.identity()->>'memberId')::uuid;
$$;
create function template_test.delete_command(n integer,target uuid) returns jsonb language sql stable as $$
 select jsonb_build_object('commandId',template_test.id(n),'templateId',target,'type','template.delete','dependsOn','[]'::jsonb,'baseValue',to_jsonb(t))
 from public.setlist_templates t where id=target;
$$;
create function template_test.capture(p_name text,p_command jsonb) returns jsonb language plpgsql as $$
declare i jsonb:=template_test.identity(); r jsonb;
begin
 r:=public.mobile_apply_template_commands((i->>'teamId')::uuid,(i->>'memberId')::uuid,jsonb_build_array(p_command))->0;
 insert into template_test.cases values(p_name,i,p_command,r); return r;
end;
$$;

do $$declare t uuid; sid uuid; m uuid; command jsonb; result jsonb; original jsonb; delete_intent jsonb; old_source jsonb;
 denied boolean; before_count bigint; member uuid; setlist_command jsonb; workflow jsonb; legacy jsonb;
begin
 select id into t from template_test.ids where key='teamA'; select id into m from public.team_members where team_id=t and profile_id=auth.uid();
 sid:=public.save_setlist_workspace(t,null,null,'{"name":"Source","event_type":"service","setlist_date":"2026-10-19","location":"Hall","call_time":"09:00","rehearsal_time":"08:00","service_times":["Sunday Worship"],"notes":"Private source notes","update_event":false}',
   array[template_test.id(10),template_test.id(10)],null);
 insert into template_test.ids values('source',sid);
 update public.setlist_songs set arrangement='Private arrangement',assigned_key='G',notes='Private notes',band_notes='Private band notes' where setlist_id=sid;
 command:=template_test.create_command(100); result:=template_test.capture('create',command); original:=result;
 assert result->>'status'='applied' and result#>>'{outcome,kind}'='created','create failed';
 assert result#>'{outcome,template,slots}'='[{"order":1,"label":"Repeated title","tag":""},{"order":2,"label":"Repeated title","tag":""}]'::jsonb,'slot mapping captured private data or lost duplicates';
 assert public.mobile_apply_template_commands(t,m,jsonb_build_array(command))->0=original,'lost-reply create retry changed';
 assert (select count(*)=1 from public.setlist_templates where id=template_test.id(1100)),'duplicate template';
 result:=template_test.capture('id-collision',jsonb_set(command,'{value,name}','"Changed intent"'));
 assert result->>'code'='command_id_conflict','changed payload reused receipt';
 result:=template_test.capture('blocked',jsonb_set(template_test.create_command(101),'{dependsOn}',jsonb_build_array(template_test.id(999))));
 assert result->>'status'='blocked','missing dependency applied';
 result:=template_test.capture('applied-dependency',jsonb_set(template_test.create_command(102),'{dependsOn}',jsonb_build_array(template_test.id(100))));
 assert result->>'status'='applied','valid template dependency blocked';
 command:=template_test.create_command(103);
 update public.setlist_songs set arrangement='Website arrangement changed' where setlist_id=sid and song_order=2;
 result:=template_test.capture('source-slot-conflict',command);
 assert result->>'status'='conflict' and result#>'{baseValue,slots}'=command#>'{sourceBase,slots}','full source slot mismatch missed';
 command:=template_test.create_command(104);
 update public.songs set title='Website title changed' where id=template_test.id(10);
 result:=template_test.capture('source-title-conflict',command);
 assert result->>'status'='conflict' and result#>>'{remote,songs,0,title}'='Website title changed','source title mismatch missed';
 command:=template_test.create_command(105);
 update public.setlists set notes='Website notes changed' where id=sid;
 result:=template_test.capture('source-record-conflict',command);
 assert result->>'status'='conflict','full source record mismatch missed';
 insert into public.events(id,team_id,name,type,event_date,starts_at,created_by)
  values(template_test.id(20),t,'Source event','service','2026-10-19','09:00',auth.uid());
 update public.setlists set event_id=template_test.id(20) where id=sid;
 command:=template_test.create_command(106);
 update public.events set description='Website event description' where id=template_test.id(20);
 result:=template_test.capture('source-event-conflict',command);
 assert result->>'status'='conflict','full linked event mismatch missed';
 update public.setlists set event_id=null where id=sid;
 delete_intent:=template_test.delete_command(110,template_test.id(1100));
 update public.setlist_templates set description='Website description' where id=template_test.id(1100);
 result:=template_test.capture('delete-conflict',delete_intent);
 assert result->>'status'='conflict','delete exact base mismatch missed';
 delete_intent:=template_test.delete_command(111,template_test.id(1100));
 result:=template_test.capture('delete',delete_intent);
 assert result->>'status'='applied' and not exists(select 1 from public.setlist_templates where id=template_test.id(1100)),'delete failed';
 assert public.mobile_apply_template_commands(t,m,jsonb_build_array(delete_intent))->0=result,'successful delete retry lost receipt';
 assert public.mobile_apply_template_commands(t,m,jsonb_build_array((select c.command from template_test.cases c where name='create')))->0=original,'historical create receipt requires current row';
 result:=template_test.capture('already-deleted',delete_intent||jsonb_build_object('commandId',template_test.id(112)));
 assert result->>'code'='unavailable','absence mistaken for this command success';

 -- Existing v2 setlist executor must reject this shared receipt ID, not replay its template result.
 setlist_command:=jsonb_build_object('commandId',template_test.id(100),'setlistId',template_test.id(500),'type','setlist.save','mode','create','baseRevision',0,'baseValue',null,
  'linkedEventBase',null,'template',null,'dependsOn','[]'::jsonb,'value',jsonb_build_object('slots','[]'::jsonb,
    'form','{"title":"Other","serviceDate":"2026-10-19","eventType":"service","serviceType":"Sunday Worship","location":"Hall","callTime":"09:00","rehearsalTime":"08:00"}'::jsonb));
 assert public.mobile_apply_setlist_commands(t,m,jsonb_build_array(setlist_command))->0->>'code'='command_id_conflict','old setlist executor replayed template receipt';
 setlist_command:=jsonb_set(setlist_command,'{commandId}',to_jsonb(template_test.id(120)));
 assert public.mobile_apply_setlist_commands(t,m,jsonb_build_array(setlist_command))->0->>'status'='applied','setlist namespace setup';
 result:=template_test.capture('setlist-id-collision',jsonb_set(template_test.create_command(121),'{commandId}',to_jsonb(template_test.id(120))));
 assert result->>'code'='command_id_conflict','template executor replayed setlist receipt';
 workflow:=jsonb_build_object('commandId',template_test.id(100),'type','attendance.respond','eventId',template_test.id(20),
   'baseRevision',0,'baseEventRevision',(select sync_revision from public.events where id=template_test.id(20)),'baseValue',null,'dependsOn','[]'::jsonb,'status','available');
 denied:=false;begin perform public.mobile_apply_workflow_commands(t,m,jsonb_build_array(workflow));exception when sqlstate '22023' then denied:=true;end;
 assert denied and not exists(select 1 from public.attendance where event_id=template_test.id(20) and team_member_id=m),'old workflow wrote with reserved template ID';
 workflow:=jsonb_set(workflow,'{commandId}',to_jsonb(template_test.id(122)));
 assert public.mobile_apply_workflow_commands(t,m,jsonb_build_array(workflow))->0->>'status'='applied','workflow receipt setup';
 result:=template_test.capture('workflow-id-collision',jsonb_set(template_test.create_command(123),'{commandId}',to_jsonb(template_test.id(122))));
 assert result->>'code'='command_id_conflict','template reused workflow receipt';
 legacy:=jsonb_build_object('commandId',template_test.id(100),'entityType','song','entityId',template_test.id(30),'baseRevision',0,'baseValue',null,
   'value',private.mobile_record(t,'song',template_test.id(10))->'value');
 denied:=false;begin perform public.mobile_apply_command(t,legacy);exception when sqlstate '22023' then denied:=true;end;
 assert denied and not exists(select 1 from public.songs where id=template_test.id(30)),'legacy write bypassed template reservation';
 legacy:=jsonb_set(legacy,'{commandId}',to_jsonb(template_test.id(124)));
 assert public.mobile_apply_command(t,legacy)->>'status'='applied','legacy receipt setup';
 result:=template_test.capture('legacy-id-collision',jsonb_set(template_test.create_command(125),'{commandId}',to_jsonb(template_test.id(124))));
 assert result->>'code'='command_id_conflict','template reused legacy receipt';

 -- Validate an entire batch before its first mutation/receipt.
 before_count:=(select count(*) from public.mobile_setlist_command_receipts);
 denied:=false;begin
  perform public.mobile_apply_template_commands(t,m,jsonb_build_array(template_test.create_command(130),template_test.create_command(131)||'{"extra":true}'::jsonb));
 exception when sqlstate '22023' then denied:=true;end;
 assert denied and (select count(*)=before_count from public.mobile_setlist_command_receipts),'bad later entry partially wrote';
 denied:=false;begin
  perform public.mobile_apply_template_commands(t,m,jsonb_build_array(jsonb_set(template_test.create_command(132),'{sourceBase,record,team_id}',to_jsonb((select id from template_test.ids where key='teamB')))));
 exception when sqlstate '22023' then denied:=true;end;
 assert denied,'foreign source accepted';
 execute 'set local role authenticated';
 denied:=false;begin perform private.apply_mobile_template_command(t,m,template_test.create_command(133));exception when sqlstate '42501' then denied:=true;end;
 assert denied,'private template executor exposed';execute 'reset role';
 assert not has_function_privilege('anon','public.mobile_apply_template_commands(uuid,uuid,jsonb)','execute'),'anon RPC grant';
 assert not has_table_privilege('authenticated','public.mobile_setlist_command_receipts','select,insert,update,delete'),'receipt table exposed';
 raise notice 'PASS create/delete exact bases, ordered duplicate labels, immutable retries/dependencies/shared namespace, full-batch validation and private grants';

 select id into member from public.team_members where team_id=t and profile_id=template_test.id(3);
 perform public.set_team_permission_override(t,null,member,'setlists.manage',true);
 perform set_config('request.jwt.claim.sub',template_test.id(3)::text,true);
 assert private.has_workspace_permission(t,'setlists.manage'),'override setup';
 command:=template_test.create_command(140);
 result:=template_test.capture('override-only-role-denial',command);
 assert result->>'code'='permission' and not exists(select 1 from public.setlist_templates where id=template_test.id(1140)),'override bypassed actual template table role';
 -- Compare actual table RLS; an override member still cannot insert or delete a template.
 execute 'set local role authenticated';
 denied:=false;begin insert into public.setlist_templates(id,team_id,name,slots,created_by) values(template_test.id(1141),t,'Denied','[]',auth.uid());exception when sqlstate '42501' then denied:=true;end;
 assert denied,'actual template INSERT RLS differs from expected role denial';
 delete from public.setlist_templates where id=template_test.id(1102);
 execute 'reset role';
 assert exists(select 1 from public.setlist_templates where id=template_test.id(1102)),'actual DELETE policy accepted override-only role';
 perform set_config('request.jwt.claim.sub',template_test.id(1)::text,true);
 update public.team_members set role='band_leader' where id=member;
 perform set_config('request.jwt.claim.sub',template_test.id(3)::text,true);
 command:=template_test.create_command(142); result:=template_test.capture('band-leader-create',command);
 assert result->>'status'='applied','allowed table role denied';
 perform set_config('request.jwt.claim.sub',template_test.id(1)::text,true);
 update public.team_members set role='member' where id=member;
 perform public.set_team_permission_override(t,null,member,'setlists.manage',false);
 perform set_config('request.jwt.claim.sub',template_test.id(3)::text,true);
 assert not private.has_workspace_permission(t,'setlists.manage'),'permission-loss setup';
 assert public.mobile_apply_template_commands(t,member,jsonb_build_array(command))->0=result,'historical own applied receipt stranded after role/grant loss';
 result:=template_test.capture('lost-role-new-intent',template_test.create_command(143));
 assert result->>'code'='permission','fresh intent applied after authority loss';
 perform set_config('request.jwt.claim.sub',template_test.id(1)::text,true);
 update public.team_members set status='inactive' where id=member;
 perform set_config('request.jwt.claim.sub',template_test.id(3)::text,true);
 denied:=false;begin perform public.mobile_apply_template_commands(t,member,jsonb_build_array(command));exception when sqlstate '42501' then denied:=true;end;
 assert denied,'revoked member replayed historical receipt';
 perform set_config('request.jwt.claim.sub',template_test.id(2)::text,true);
 denied:=false;begin perform public.mobile_apply_template_commands(t,m,jsonb_build_array(command));exception when sqlstate '42501' then denied:=true;end;
 assert denied,'other tenant replayed receipt';
 perform set_config('request.jwt.claim.sub','',true);
 denied:=false;begin perform public.mobile_apply_template_commands(t,m,jsonb_build_array(command));exception when sqlstate '42501' then denied:=true;end;
 assert denied,'anonymous caller executed RPC';
 perform set_config('request.jwt.claim.sub',template_test.id(1)::text,true);
 command:=template_test.create_command(150);
 perform public.delete_setlist_cascade(sid);
 result:=template_test.capture('deleted-source',command);
 assert result->>'code'='permission','deleted source captured as template';
 raise notice 'PASS actual template RLS role denial, approved-role allow, historical own receipt after role/grant loss, revoked membership, two tenants, anon and deleted source';

 -- Fresh source for concurrent exact retry and competing target identity races.
 sid:=public.save_setlist_workspace(t,null,null,'{"name":"Race source","event_type":"service","setlist_date":"2026-10-19","location":"Hall","call_time":"09:00","rehearsal_time":"08:00","service_times":["Sunday Worship"],"update_event":false}',array[template_test.id(10)],null);
 update template_test.ids set id=sid where key='source';
 insert into template_test.race values(template_test.create_command(190));
end;
$$;

-- Actual song SELECT RLS remains authoritative for source-title/conflict disclosure.
do $$declare t uuid; m uuid; command jsonb; conflict_command jsonb; result jsonb; denied boolean; approved_title text;
begin
 perform set_config('request.jwt.claim.sub',template_test.id(1)::text,true);
 select id into t from template_test.ids where key='teamA'; select id into m from public.team_members where team_id=t and profile_id=auth.uid();
 command:=template_test.create_command(200); conflict_command:=template_test.create_command(201);
 select title into approved_title from public.songs where id=template_test.id(10);
 update public.songs set title='A readable website title' where id=template_test.id(10);
 result:=template_test.capture('title-before-revocation-conflict',conflict_command);
 assert result->>'status'='conflict','song privacy conflict setup';
 perform set_config('request.jwt.claim.sub','',true);
 -- Local administrator-only fixture simulates legacy status changes. The ordinary
 -- website protects status identity; no trigger is disabled in application code.
 alter table public.songs disable trigger songs_guard_identity;
 update public.songs set status='pending',title='Private pending title' where id=template_test.id(10);
 alter table public.songs enable trigger songs_guard_identity;
 perform set_config('request.jwt.claim.sub',template_test.id(1)::text,true);
 execute 'set local role authenticated';
 assert not exists(select 1 from public.songs where id=template_test.id(10)),'actual pending song SELECT visibility setup';
 execute 'reset role';
 result:=template_test.capture('hidden-source-song-denial',command);
 assert result->>'status'='rejected' and result->>'code'='permission','pending song title leaked through template conflict';
 denied:=false;begin perform public.mobile_apply_template_commands(t,m,jsonb_build_array(conflict_command));exception when sqlstate '42501' then denied:=true;end;
 assert denied,'historical conflict disclosed source titles after SELECT revocation';
 perform set_config('request.jwt.claim.sub','',true);
 alter table public.songs disable trigger songs_guard_identity;
 update public.songs set status='approved',title=approved_title,deleted_at=clock_timestamp() where id=template_test.id(10);
 alter table public.songs enable trigger songs_guard_identity;
 perform set_config('request.jwt.claim.sub',template_test.id(1)::text,true);
 result:=template_test.capture('retained-approved-song-create',template_test.create_command(202));
 assert result->>'status'='applied','retained approved source song denied';
 update public.songs set deleted_at=null where id=template_test.id(10);
 raise notice 'PASS actual approved-only song SELECT boundary protects fresh and historical conflict titles; retained approved source remains valid';
end;
$$;


