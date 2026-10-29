\set ON_ERROR_STOP on
-- Disposable loopback PostgreSQL fixture only. Never execute on hosted data.
create schema rehearsal_test;
create function rehearsal_test.id(n integer) returns uuid language sql immutable as $$ select ('96000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create table rehearsal_test.ids(key text primary key,id uuid not null);
create table rehearsal_test.cases(name text primary key,identity jsonb not null,command jsonb not null,result jsonb not null);
grant usage on schema rehearsal_test to authenticated;
grant select,insert on rehearsal_test.ids,rehearsal_test.cases to authenticated;
insert into auth.users(id,email) values(rehearsal_test.id(1),'rehearsal-owner@example.test'),(rehearsal_test.id(2),'rehearsal-other@example.test'),(rehearsal_test.id(3),'rehearsal-member@example.test');
select set_config('request.jwt.claim.sub',rehearsal_test.id(1)::text,false);
insert into rehearsal_test.ids select 'team',team_id from public.create_team_workspace('Rehearsal A','RA-61021');
select set_config('request.jwt.claim.sub',rehearsal_test.id(2)::text,false);
insert into rehearsal_test.ids select 'other-team',team_id from public.create_team_workspace('Rehearsal B','RB-61021');
select set_config('request.jwt.claim.sub',rehearsal_test.id(1)::text,false);
insert into public.team_members(team_id,profile_id,role,status) select id,rehearsal_test.id(3),'member','active' from rehearsal_test.ids where key='team';
insert into public.songs(id,team_id,title,artist,original_key,lyrics_chords,created_by,status)
 select rehearsal_test.id(10),id,'Repeated song','Artist','C','[C]Lyrics',auth.uid(),'approved' from rehearsal_test.ids where key='team';
insert into public.events(id,team_id,name,type,event_date,starts_at,created_by,approval_status)
 select rehearsal_test.id(11),id,'Service','service','2026-10-25','09:00',auth.uid(),'approved' from rehearsal_test.ids where key='team';
insert into public.event_assignments(event_id,team_member_id,assignment)
 select rehearsal_test.id(11),tm.id,'Band Member' from public.team_members tm where tm.team_id=(select id from rehearsal_test.ids where key='team') and tm.status='active';
insert into rehearsal_test.ids select 'setlist',public.save_setlist_workspace((select id from rehearsal_test.ids where key='team'),null,rehearsal_test.id(11),
 '{"name":"Rehearsal","event_type":"service","setlist_date":"2026-10-25","location":"Hall","call_time":"09:00","rehearsal_time":"08:00","service_times":["Sunday Worship"],"update_event":false}',array[rehearsal_test.id(10),rehearsal_test.id(10)],null);
create function rehearsal_test.actor() returns jsonb language sql stable as $$ select jsonb_build_object('userId',auth.uid(),'teamId',tm.team_id,'memberId',tm.id)
 from public.team_members tm where profile_id=auth.uid() and team_id=(select id from rehearsal_test.ids where key='team') and status='active' $$;
create function rehearsal_test.workspace() returns jsonb language sql as $$ select public.mobile_read_rehearsal_workspace((rehearsal_test.actor()->>'teamId')::uuid,(rehearsal_test.actor()->>'memberId')::uuid,(select id from rehearsal_test.ids where key='setlist')) $$;
create function rehearsal_test.command(n integer,kind text) returns jsonb language plpgsql as $$
declare w jsonb:=rehearsal_test.workspace(); a jsonb:=rehearsal_test.actor(); c jsonb; task text; slot uuid; value jsonb;
begin
 c:=jsonb_build_object('commandId',rehearsal_test.id(n),'setlistId',w->'setlistId','type',kind,'dependsOn','[]'::jsonb,
  'baseParent',w-array['plan','checks','readiness','members','assignedMemberIds']);
 if kind='rehearsal.plan.save' then
  if w->'plan'='null'::jsonb then
   select jsonb_agg(jsonb_build_object('key',key,'assignee_member_id',case when ordinal=1 then a->>'memberId'
    when ordinal=2 then (select id::text from public.team_members where team_id=(a->>'teamId')::uuid and profile_id=rehearsal_test.id(3)) else null end) order by ordinal)
   into value from unnest(array['Tune instruments and check cables','Check monitors and click levels','Agree intros, endings and transitions',
    'Warm up and check comfortable keys','Confirm lead vocals and harmonies','Agree cues and microphone handoffs','Confirm roles, call time and attendance',
    'Verify lyrics and slide order','Check microphones and backing tracks','Confirm prayer, media and dance cues']) with ordinality t(key,ordinal);
  else value:=w#>'{plan,tasks}'; end if;
  return c||jsonb_build_object('baseValue',w->'plan','value',jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('slot_id',w#>'{slots,0,id}','minutes',10,'focus','Intro')),'tasks',value));
 elsif kind='rehearsal.task.respond' then
  select v->>'key' into task from jsonb_array_elements(w#>'{plan,tasks}') v where v->>'assignee_member_id'=a->>'memberId' limit 1;
  return c||jsonb_build_object('taskKey',task,'completed',true,'basePlan',w->'plan','baseValue',coalesce((select v from jsonb_array_elements(w->'checks') v where v->>'task_key'=task and v->>'team_member_id'=a->>'memberId'),'null'::jsonb));
 else
  slot:=(w#>>'{slots,0,id}')::uuid;
  return c||jsonb_build_object('slotId',slot,'state','ready','note','Intro learned','baseValue',coalesce((select v from jsonb_array_elements(w->'readiness') v where (v->>'slot_id')::uuid=slot and v->>'team_member_id'=a->>'memberId'),'null'::jsonb));
 end if;
end;
$$;
create function rehearsal_test.capture(label text,c jsonb) returns jsonb language plpgsql as $$
declare a jsonb:=rehearsal_test.actor(); r jsonb;
begin r:=public.mobile_apply_rehearsal_commands((a->>'teamId')::uuid,(a->>'memberId')::uuid,jsonb_build_array(c))->0;
 insert into rehearsal_test.cases values(label,a,c,r); return r; end;
$$;
set role authenticated;
do $$declare c jsonb; r jsonb; first_receipt jsonb; w jsonb; a jsonb:=rehearsal_test.actor(); denied boolean;
begin
 w:=rehearsal_test.workspace(); assert jsonb_array_length(w->'slots')=2 and w->'plan'='null'::jsonb,'initial download';
 c:=rehearsal_test.command(100,'rehearsal.plan.save'); r:=rehearsal_test.capture('plan-save',c); assert r->>'status'='applied','plan save'; first_receipt:=r;
 assert public.mobile_apply_rehearsal_commands((a->>'teamId')::uuid,(a->>'memberId')::uuid,jsonb_build_array(c))->0=first_receipt,'lost reply exact retry';
 r:=rehearsal_test.capture('id-conflict',jsonb_set(c,'{value,allocations,0,focus}','"Changed intent"')); assert r->>'code'='command_id_conflict','changed payload ID';
 c:=rehearsal_test.command(101,'rehearsal.plan.save');
 perform public.save_rehearsal_plan((w->>'setlistId')::uuid,1,'[]',(rehearsal_test.workspace()#>'{plan,tasks}'));
 r:=rehearsal_test.capture('plan-conflict',c); assert r->>'status'='conflict' and r->'original'=c,'website plan conflict';
 c:=rehearsal_test.command(102,'rehearsal.task.respond'); r:=rehearsal_test.capture('task-response',c); assert r->>'status'='applied','task response';
 c:=rehearsal_test.command(103,'rehearsal.task.respond'); perform public.respond_preparation_task((w->>'setlistId')::uuid,c->>'taskKey',false);
 r:=rehearsal_test.capture('task-conflict',c); assert r->>'status'='conflict','own check concurrent edit';
 c:=rehearsal_test.command(104,'rehearsal.readiness.respond'); r:=rehearsal_test.capture('readiness-response',c); assert r->>'status'='applied','readiness response';
 assert jsonb_array_length(r#>'{workspace,readiness}')=1,'duplicate song readiness leaked to other occurrence';
 c:=rehearsal_test.command(105,'rehearsal.readiness.respond'); perform public.respond_song_readiness((c->>'slotId')::uuid,'practicing','Changed on website');
 r:=rehearsal_test.capture('readiness-conflict',c); assert r->>'status'='conflict','own readiness concurrent edit';
 c:=jsonb_set(rehearsal_test.command(106,'rehearsal.task.respond'),'{taskKey}','"Warm up and check comfortable keys"');
 r:=rehearsal_test.capture('unassigned-task',c); assert r->>'code'='permission','unassigned task grant';
 c:=jsonb_set(rehearsal_test.command(107,'rehearsal.plan.save'),'{dependsOn}',jsonb_build_array(rehearsal_test.id(999)));
 r:=rehearsal_test.capture('blocked-dependency',c); assert r->>'status'='blocked','missing dependency';
 c:=rehearsal_test.command(108,'rehearsal.plan.save'); c:=jsonb_set(c,'{baseParent,setlistRevision}',to_jsonb((c#>>'{baseParent,setlistRevision}')::bigint+1));
 r:=rehearsal_test.capture('parent-conflict',c); assert r->>'status'='conflict','stale parent';
 denied:=false; begin perform public.mobile_read_rehearsal_workspace((select id from rehearsal_test.ids where key='other-team'),(a->>'memberId')::uuid,(w->>'setlistId')::uuid); exception when insufficient_privilege then denied:=true; end; assert denied,'cross team read';
 denied:=false; begin perform public.mobile_read_rehearsal_workspace((a->>'teamId')::uuid,rehearsal_test.id(999),(w->>'setlistId')::uuid); exception when insufficient_privilege then denied:=true; end; assert denied,'wrong membership';
end$$;
select set_config('request.jwt.claim.sub',rehearsal_test.id(3)::text,false);
do $$declare c jsonb; r jsonb;
begin
 c:=rehearsal_test.command(109,'rehearsal.plan.save'); r:=rehearsal_test.capture('member-plan-denied',c); assert r->>'code'='permission','member plan override';
 c:=rehearsal_test.command(110,'rehearsal.task.respond'); r:=rehearsal_test.capture('member-own-task',c); assert r->>'status'='applied','member own check';
 c:=rehearsal_test.command(111,'rehearsal.readiness.respond'); r:=rehearsal_test.capture('member-own-readiness',c); assert r->>'status'='applied','member own readiness';
end$$;
reset role;
select set_config('request.jwt.claim.sub',rehearsal_test.id(1)::text,false);
do $$declare t uuid:=(rehearsal_test.actor()->>'teamId')::uuid; m uuid:=(rehearsal_test.actor()->>'memberId')::uuid; c jsonb; denied boolean;
begin
 c:=rehearsal_test.command(112,'rehearsal.readiness.respond'); delete from public.event_assignments where team_member_id=m;
 assert rehearsal_test.capture('lost-assignment',c)->>'code'='permission','readiness assignment revoked';
 c:=rehearsal_test.command(113,'rehearsal.plan.save');
 update public.setlists set deleted_at=now() where id=(select id from rehearsal_test.ids where key='setlist');
 denied:=false; begin perform public.mobile_apply_rehearsal_commands(t,m,jsonb_build_array((select command from rehearsal_test.cases where name='plan-save'))); exception when insufficient_privilege then denied:=true; end; assert denied,'deleted parent replay';
 update public.setlists set deleted_at=null where id=(select id from rehearsal_test.ids where key='setlist');
 select id into m from public.team_members where team_id=t and profile_id=rehearsal_test.id(3);
 update public.team_members set status='inactive' where id=m;
 perform set_config('request.jwt.claim.sub',rehearsal_test.id(3)::text,false);
 denied:=false; begin perform public.mobile_apply_rehearsal_commands(t,m,jsonb_build_array(c)); exception when insufficient_privilege then denied:=true; end; assert denied,'revoked member';
end$$;
set role anon;
do $$declare denied boolean:=false;
begin begin perform public.mobile_read_rehearsal_workspace(rehearsal_test.id(1),rehearsal_test.id(2),rehearsal_test.id(3)); exception when insufficient_privilege then denied:=true; end; assert denied,'anonymous access'; end$$;
reset role;
select 'PASS rehearsal plans, own tasks/readiness, exact retry, conflicts, two teams, duplicate occurrences, revoked membership, deleted parent, dependency and anonymous boundaries';
