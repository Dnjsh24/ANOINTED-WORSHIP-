\set ON_ERROR_STOP on
-- Runs after local-db-setlist-aggregate.sql in an owned disposable cluster only.
create schema setlist_api_test;
create table setlist_api_test.cases(name text primary key,identity jsonb not null,command jsonb not null,result jsonb not null);
create table setlist_api_test.reviews(name text primary key,identity jsonb not null,setlist_id uuid not null,review jsonb not null);
create table setlist_api_test.race_command(command jsonb not null);
create table setlist_api_test.race_results(value jsonb not null);
grant usage on schema setlist_api_test to authenticated;
grant select on setlist_api_test.race_command,setlist_test.ids to authenticated;
grant insert,select on setlist_api_test.race_results to authenticated;
create function setlist_api_test.identity() returns jsonb language sql stable as $$
 select jsonb_build_object('userId',auth.uid(),'teamId',team_id,'memberId',id) from public.team_members where profile_id=auth.uid() and team_id=(select id from setlist_test.ids where key='teamA') and status='active';
$$;
create function setlist_api_test.save(p_n integer,p_target uuid,p_create boolean default true) returns jsonb language sql stable as $$
 select jsonb_build_object('commandId',setlist_test.id(p_n),'setlistId',p_target,'type','setlist.save','mode',case when p_create then 'create' else 'update' end,
 'baseRevision',case when p_create then 0 else (setlist_test.base(p_target)->'record'->>'sync_revision')::bigint end,'baseValue',case when p_create then 'null'::jsonb else setlist_test.base(p_target) end,
 'dependsOn','[]'::jsonb,'linkedEventBase',case when p_create then 'null'::jsonb else setlist_test.base(p_target)->'linkedEvent' end,'template',null,
 'value',jsonb_build_object('form',jsonb_build_object('title','Mobile Sunday','serviceDate','2026-10-18','eventType','service','serviceType','Sunday Worship','location','Hall','callTime','09:00','rehearsalTime','08:00','notes','Keep mobile notes'),
 'slots',case when p_create then jsonb_build_array(setlist_test.slot(setlist_test.id(p_n+10000),setlist_test.id(11))) else setlist_test.slots(p_target) end));
$$;
create function setlist_api_test.template(p_command jsonb,p_n integer) returns jsonb language sql stable as $$
 select jsonb_set(p_command,'{template}',jsonb_build_object('base',to_jsonb(t),'placeholders',jsonb_build_array(
   jsonb_build_object('slotId',setlist_test.id(p_n+20000),'songId',setlist_test.id(p_n+21000)),jsonb_build_object('slotId',setlist_test.id(p_n+22000),'songId',setlist_test.id(p_n+23000)))))
 from public.setlist_templates t where id=setlist_test.id(50);
$$;
create function setlist_api_test.capture(p_name text,p_command jsonb) returns jsonb language plpgsql as $$
declare v_identity jsonb:=setlist_api_test.identity(); v_result jsonb;
begin
 v_result:=public.mobile_apply_setlist_commands((v_identity->>'teamId')::uuid,(v_identity->>'memberId')::uuid,jsonb_build_array(p_command))->0;
 insert into setlist_api_test.cases values(p_name,v_identity,p_command,v_result); return v_result;
end;
$$;

-- A receipt is immutable, but linked-event disclosure must follow current visibility.
do $$declare t uuid; m uuid; command jsonb; stale_command jsonb; saved jsonb; conflicted jsonb; denied boolean; status text;
begin
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
 select id into t from setlist_test.ids where key='teamA';
 select id into m from public.team_members where team_id=t and profile_id=setlist_test.id(3);
 perform public.set_team_permission_override(t,null,m,'setlists.manage',true);
 insert into public.events(id,team_id,name,type,event_date,starts_at,created_by)
  values(setlist_test.id(841),t,'Linked receipt privacy','service','2026-10-18','09:00',setlist_test.id(1));
 perform set_config('request.jwt.claim.sub',setlist_test.id(3)::text,true);
 command:=jsonb_set(jsonb_set(setlist_api_test.save(661,setlist_test.id(761)),'{linkedEventBase}',private.mobile_event_snapshot(t,setlist_test.id(841))->'record'),
  '{value,form,eventId}',to_jsonb(setlist_test.id(841)));
 saved:=setlist_api_test.capture('linked-member-save',command);
 assert saved->>'status'='applied' and saved#>>'{outcome,snapshot,linkedEvent,name}'='Linked receipt privacy','visible linked save setup failed';
 stale_command:=setlist_api_test.save(662,setlist_test.id(761),false);
 perform public.save_setlist_workspace(t,setlist_test.id(761),null,jsonb_set(setlist_test.details(),'{name}','"Website privacy change"'),array[setlist_test.id(11)],null,(stale_command->>'baseRevision')::bigint);
 conflicted:=setlist_api_test.capture('linked-member-conflict',stale_command);
 assert conflicted->>'status'='conflict','linked conflict setup failed';
 foreach status in array array['pending','rejected'] loop
  perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
  update public.events set approval_status=status where id=setlist_test.id(841);
  perform set_config('request.jwt.claim.sub',setlist_test.id(3)::text,true);
  denied:=false;begin perform public.mobile_apply_setlist_commands(t,m,jsonb_build_array(command));exception when sqlstate '42501' then denied:=true;end;
  assert denied,'old applied result disclosed newly private event';
  denied:=false;begin perform public.mobile_apply_setlist_commands(t,m,jsonb_build_array(stale_command));exception when sqlstate '42501' then denied:=true;end;
  assert denied,'old conflict result disclosed newly private event';
  denied:=false;begin perform public.mobile_apply_setlist_commands(t,m,jsonb_build_array(stale_command||jsonb_build_object('commandId',setlist_test.id(663))));exception when sqlstate '42501' then denied:=true;end;
  assert denied and not exists(select 1 from public.mobile_setlist_command_receipts where command_id=setlist_test.id(663)),'fresh conflict stored or returned inaccessible event base';
 end loop;
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
 update public.events set approval_status='approved' where id=setlist_test.id(841);
 perform set_config('request.jwt.claim.sub',setlist_test.id(3)::text,true);
 assert public.mobile_apply_setlist_commands(t,m,jsonb_build_array(command))->0=saved,'restored visibility changed immutable applied result';
 assert public.mobile_apply_setlist_commands(t,m,jsonb_build_array(stale_command))->0=conflicted,'restored visibility changed immutable conflict result';
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
 update public.events set approval_status='pending',created_by=setlist_test.id(3) where id=setlist_test.id(841);
 perform set_config('request.jwt.claim.sub',setlist_test.id(3)::text,true);
 assert public.mobile_apply_setlist_commands(t,m,jsonb_build_array(command))->0=saved,'current event creator lost valid replay';
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
 update public.events set deleted_at=now() where id=setlist_test.id(841);
 perform set_config('request.jwt.claim.sub',setlist_test.id(3)::text,true);
 denied:=false;begin perform public.mobile_apply_setlist_commands(t,m,jsonb_build_array(command));exception when sqlstate '42501' then denied:=true;end;
 assert denied,'deleted event disclosed through old save result';
 execute 'set local role authenticated';
 denied:=false;begin perform private.assert_mobile_setlist_result_visibility(t,saved);exception when sqlstate '42501' then denied:=true;end;
 assert denied,'client can execute private visibility helper';execute 'reset role';
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
 perform public.set_team_permission_override(t,null,m,'setlists.manage',null);
 raise notice 'PASS current linked-event visibility gates saved/conflict retries and new conflicts; restored/creator access preserves results; deleted events remain private';
end;
$$;
select set_config('request.jwt.claim.sub',setlist_test.id(1)::text,false);
do $$declare t uuid; m uuid; command jsonb; result jsonb; original jsonb; n bigint; before_rows jsonb; denied boolean; review jsonb; target uuid; sibling uuid; sibling_deleted uuid; workflow jsonb; song jsonb; revoked_member uuid; revoked_command jsonb; prior_member_result jsonb;
begin
 select id into t from setlist_test.ids where key='teamA'; select id into m from public.team_members where team_id=t and profile_id=auth.uid();
 command:=setlist_api_test.save(600,setlist_test.id(700)); result:=setlist_api_test.capture('create',command); original:=result;
 assert result->>'status'='applied' and result->'outcome'->>'kind'='saved','create not applied';
 assert setlist_api_test.capture('create-retry',command)=original,'create retry receipt changed';
 assert (select count(*)=1 from public.activity_logs where target_id=setlist_test.id(700)),'create activity duplicated/missing';
 result:=setlist_api_test.capture('id-conflict',jsonb_set(command,'{value,form,title}','"Different intent"'));
 assert result->>'code'='command_id_conflict','changed command reused ID';
 command:=setlist_api_test.save(601,setlist_test.id(700),false); result:=setlist_api_test.capture('update',command);
 assert result->>'status'='applied','update not applied';
 command:=setlist_api_test.save(602,setlist_test.id(700),false);
 perform public.save_setlist_workspace(t,setlist_test.id(700),null,jsonb_set(setlist_test.details(),'{name}','"Website changed"'),array[setlist_test.id(11)],null,(command->>'baseRevision')::bigint);
 result:=setlist_api_test.capture('website-conflict',command); assert result->>'status'='conflict' and result->'baseValue'=command->'baseValue' and result->'remote'->'snapshot'->'record'->>'name'='Website changed','concurrent website edit lost';
 assert setlist_api_test.capture('conflict-retry',command)=result,'conflict receipt changed';
 result:=setlist_api_test.capture('updated-new-base',setlist_api_test.save(603,setlist_test.id(700),false));assert result->>'status'='applied','fresh update failed';
 command:=setlist_api_test.template(setlist_api_test.save(604,setlist_test.id(704)),604); result:=setlist_api_test.capture('template-create',command);
 assert result->>'status'='applied' and jsonb_array_length(result->'outcome'->'placeholders')=2,'template map missing';
 assert setlist_api_test.capture('template-retry',command)=result,'template retry regenerated IDs';
 command:=setlist_api_test.template(setlist_api_test.save(605,setlist_test.id(705)),605);
 update public.setlist_templates set name='Changed after offline selection' where id=setlist_test.id(50);
 n:=(select count(*) from public.songs); result:=setlist_api_test.capture('template-conflict',command);
 assert result->>'status'='conflict' and not exists(select 1 from public.setlists where id=setlist_test.id(705)) and (select count(*)=n from public.songs),'template conflict partially applied';
 result:=setlist_api_test.capture('missing-dependency',jsonb_set(setlist_api_test.save(606,setlist_test.id(706)),'{dependsOn}',jsonb_build_array(setlist_test.id(999999))));assert result->>'status'='blocked','missing dependency applied';
 result:=setlist_api_test.capture('setlist-dependency',jsonb_set(setlist_api_test.save(607,setlist_test.id(707)),'{dependsOn}',jsonb_build_array(setlist_test.id(600))));assert result->>'status'='applied','applied setlist dependency refused';
 raise notice 'PASS create/update/template exact retries, changed-intent rejection, immutable conflicts and setlist dependencies';

 insert into public.events(id,team_id,name,type,event_date,starts_at,created_by) values(setlist_test.id(820),t,'Workflow dependency','service','2026-10-18','09:00',auth.uid());
 workflow:=jsonb_build_object('commandId',setlist_test.id(630),'eventId',setlist_test.id(820),'type','attendance.respond','baseRevision',0,'baseEventRevision',(select sync_revision from public.events where id=setlist_test.id(820)),
   'baseValue',null,'dependsOn','[]'::jsonb,'status','available');
 result:=public.mobile_apply_workflow_commands(t,m,jsonb_build_array(workflow))->0; assert result->>'status'='applied','workflow setup failed';
 result:=setlist_api_test.capture('workflow-dependency',jsonb_set(setlist_api_test.save(608,setlist_test.id(708)),'{dependsOn}',jsonb_build_array(setlist_test.id(630))));assert result->>'status'='applied','same-scope v2 workflow dependency refused';
 result:=setlist_api_test.capture('workflow-id-collision',setlist_api_test.save(630,setlist_test.id(730))); assert result->>'code'='command_id_conflict','workflow command ID was reused';
 song:=jsonb_build_object('commandId',setlist_test.id(632),'entityType','song','entityId',setlist_test.id(832),'baseRevision',0,'baseValue',null,
  'value',jsonb_build_object('title','V1 dependency','artist','Artist','original_key','C','bpm',null,'time_signature','4/4','lyrics_chords','[C] Song','youtube_url',null,'spotify_url',null,'image_url',null,'album',null,'tags','[]'::jsonb));
 result:=public.mobile_apply_command(t,song);assert result->>'status'='applied','legacy setup failed';
 result:=setlist_api_test.capture('v1-dependency-blocked',jsonb_set(setlist_api_test.save(609,setlist_test.id(709)),'{dependsOn}',jsonb_build_array(setlist_test.id(632)))); assert result->>'status'='blocked','v1 receipt inferred member identity';
 result:=setlist_api_test.capture('v1-id-collision',setlist_api_test.save(632,setlist_test.id(732)));assert result->>'code'='command_id_conflict','v1 command ID reused';
 denied:=false;begin
  perform public.mobile_apply_command(t,jsonb_set(jsonb_set(song,'{commandId}',to_jsonb(setlist_test.id(600))),'{entityId}',to_jsonb(setlist_test.id(833))));
 exception when sqlstate '22023' then denied:=true;end;
 assert denied and not exists(select 1 from public.songs where id=setlist_test.id(833)),'legacy reverse collision did not roll back its mutation';
 workflow:=workflow||jsonb_build_object('commandId',setlist_test.id(600),'baseRevision',1,'baseValue',jsonb_build_object('status','available','note',null),'status','maybe');
 denied:=false;begin perform public.mobile_apply_workflow_commands(t,m,jsonb_build_array(workflow));exception when sqlstate '22023' then denied:=true;end;
 assert denied and (select status='available' from public.attendance where event_id=setlist_test.id(820) and team_member_id=m),'workflow reverse collision changed attendance';
 raise notice 'PASS same-member v2 dependencies, unsupported v1 dependency and bidirectional cross-ledger collision rollback';

 -- Complete deletion read includes both active and soft-deleted sibling rows.
 insert into public.events(id,team_id,name,type,event_date,starts_at,created_by) values(setlist_test.id(840),t,'Delete scope','service','2026-10-18','09:00',auth.uid());
 target:=public.save_setlist_workspace(t,null,setlist_test.id(840),setlist_test.details(),array[setlist_test.id(10)],null);
 sibling:=public.save_setlist_workspace(t,null,setlist_test.id(840),setlist_test.details(),array[setlist_test.id(10)],null);
 sibling_deleted:=public.save_setlist_workspace(t,null,setlist_test.id(840),setlist_test.details(),array[setlist_test.id(10)],null);
 update public.setlists set deleted_at=now() where id=sibling_deleted;
 review:=public.mobile_read_setlist_delete_scope(t,m,target);
 assert jsonb_array_length(review->'siblings')=2,'scope omitted deleted sibling';
 insert into setlist_api_test.reviews values('linked',setlist_api_test.identity(),target,review);
 insert into setlist_api_test.reviews values('standalone',setlist_api_test.identity(),setlist_test.id(700),public.mobile_read_setlist_delete_scope(t,m,setlist_test.id(700)));
 command:=jsonb_build_object('commandId',setlist_test.id(650),'setlistId',target,'type','setlist.delete','baseRevision',review->'snapshot'->'record'->'sync_revision','baseValue',review->'snapshot','dependsOn','[]'::jsonb,'cascade',jsonb_set(review->'cascade','{unlinkSetlists}','[]'));
 result:=setlist_api_test.capture('delete-scope-conflict',command);assert result->>'status'='conflict' and jsonb_array_length(result->'remote'->'deleteReview'->'siblings')=2,'incomplete delete scope applied';
 command:=command||jsonb_build_object('commandId',setlist_test.id(651),'cascade',review->'cascade');
 result:=setlist_api_test.capture('delete',command); original:=result;
 assert result->>'status'='applied' and result->'outcome'->>'kind'='deleted' and jsonb_array_length(result->'outcome'->'unlinkedSetlists')=2,'delete acknowledgements incomplete';
 assert setlist_api_test.capture('delete-retry',command)=original,'own deletion retry lost receipt';
 result:=setlist_api_test.capture('missing-target-unknown-command',command||jsonb_build_object('commandId',setlist_test.id(652)));assert result->>'code'='unavailable','target absence invented success';
 assert (select deleted_at is not null and event_id is null from public.setlists where id=sibling_deleted),'deleted sibling resurrected';
 raise notice 'PASS full deletion review, tombstone/sibling acknowledgements, exact delete replay and unknown missing target';

 -- Permission is checked before any old result or deletion scope can be returned.
 select id into revoked_member from public.team_members where team_id=t and profile_id=setlist_test.id(3);
 perform public.set_team_permission_override(t,null,revoked_member,'setlists.manage',true);
 perform set_config('request.jwt.claim.sub',setlist_test.id(3)::text,true);
 revoked_command:=setlist_api_test.save(660,setlist_test.id(760)); prior_member_result:=setlist_api_test.capture('member-granted-create',revoked_command); assert prior_member_result->>'status'='applied','permission-granted member setup failed';
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true); perform public.set_team_permission_override(t,null,revoked_member,'setlists.manage',false);
 perform set_config('request.jwt.claim.sub',setlist_test.id(3)::text,true);
 denied:=false;begin perform public.mobile_apply_setlist_commands(t,revoked_member,jsonb_build_array(revoked_command));exception when sqlstate '42501' then denied:=true;end;assert denied,'revocation returned old result';
 denied:=false;begin perform public.mobile_read_setlist_delete_scope(t,revoked_member,setlist_test.id(760));exception when sqlstate '42501' then denied:=true;end;assert denied,'revocation returned review content';
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true); perform public.set_team_permission_override(t,null,revoked_member,'setlists.manage',true);
 perform set_config('request.jwt.claim.sub',setlist_test.id(3)::text,true);
 assert public.mobile_apply_setlist_commands(t,revoked_member,jsonb_build_array(revoked_command))->0=prior_member_result,'re-authorized exact result changed';
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true); perform public.set_team_permission_override(t,null,revoked_member,'setlists.manage',null);
 assert public.mobile_apply_setlist_commands(t,m,jsonb_build_array(command))->0=original,'owner exact delete receipt changed';
 denied:=false;begin perform public.mobile_apply_setlist_commands(t,(select id from public.team_members where team_id=t and profile_id=setlist_test.id(3)),jsonb_build_array(command));exception when sqlstate '42501' then denied:=true;end;assert denied,'wrong member identity returned receipt';
 before_rows:=jsonb_build_object('setlists',(select count(*) from public.setlists),'receipts',(select count(*) from public.mobile_setlist_command_receipts));
 denied:=false;begin
  perform public.mobile_apply_setlist_commands(t,m,jsonb_build_array(setlist_api_test.save(680,setlist_test.id(780)),jsonb_set(setlist_api_test.save(681,setlist_test.id(781)),'{value,slots,0,notes}','false')));
 exception when sqlstate '22023' then denied:=true;end;
 assert denied and before_rows=jsonb_build_object('setlists',(select count(*) from public.setlists),'receipts',(select count(*) from public.mobile_setlist_command_receipts)),'later malformed entry partially applied batch';
 raise notice 'PASS revoked permission/wrong member cannot replay content; all-command preflight prevents partial malformed batches';

 -- A forced unexpected receipt write failure rolls back all mutation side effects.
 execute 'create function setlist_api_test.fail_receipt() returns trigger language plpgsql as $fn$begin if new.command_id=setlist_test.id(670) then raise exception ''forced receipt write failure''; end if; return new;end$fn$';
 execute 'create trigger zz_test_receipt_failure before insert on public.mobile_setlist_command_receipts for each row execute function setlist_api_test.fail_receipt()';
 command:=setlist_api_test.template(setlist_api_test.save(670,setlist_test.id(770)),670);
 n:=(select count(*) from public.songs); denied:=false;begin perform public.mobile_apply_setlist_commands(t,m,jsonb_build_array(command));exception when raise_exception then denied:=true;end;
 assert denied and (select count(*)=n from public.songs) and not exists(select 1 from public.setlists where id=setlist_test.id(770))
   and not exists(select 1 from public.activity_logs where target_id=setlist_test.id(770)) and not exists(select 1 from public.mobile_setlist_command_receipts where command_id=setlist_test.id(670)),'receipt failure left partial setlist/template/activity';
 execute 'drop trigger zz_test_receipt_failure on public.mobile_setlist_command_receipts';execute 'drop function setlist_api_test.fail_receipt()';
 denied:=false;begin update public.mobile_setlist_command_receipts set result='{}' where command_id=setlist_test.id(600);exception when sqlstate '22023' then denied:=true;end;assert denied,'receipt update allowed';
 execute 'set local role authenticated';
 denied:=false;begin perform count(*) from public.mobile_setlist_command_receipts;exception when sqlstate '42501' then denied:=true;end;assert denied,'direct client receipt read exposed';
 execute 'reset role';
 insert into setlist_api_test.race_command values(setlist_api_test.template(setlist_api_test.save(690,setlist_test.id(790)),690));
 raise notice 'PASS immutable/private receipts and forced receipt failure rolls back aggregate, placeholders and activity';
end;
$$;

-- Execute denied table operations as real database roles, rather than inferring all CRUD from SELECT.
do $$declare t uuid; m uuid; command jsonb; before_rows jsonb; denied boolean; client_role text;
 actor uuid:=setlist_test.id(1); receipt_id uuid:=setlist_test.id(999990); target_id uuid:=setlist_test.id(999991); review_id uuid:=setlist_test.id(700);
begin
 perform set_config('request.jwt.claim.sub',setlist_test.id(1)::text,true);
 select id into t from setlist_test.ids where key='teamA';
 select id into m from public.team_members where team_id=t and profile_id=auth.uid();
 command:=setlist_api_test.save(699,setlist_test.id(799));
 select coalesce(jsonb_agg(to_jsonb(r) order by actor_id,team_id,command_id),'[]'::jsonb) into before_rows from public.mobile_setlist_command_receipts r;
 foreach client_role in array array['authenticated','anon'] loop
  execute format('set local role %I',client_role);
  denied:=false;begin perform count(*) from public.mobile_setlist_command_receipts;exception when sqlstate '42501' then denied:=true;end;
  assert denied,'client role can SELECT private receipt content';
  denied:=false;begin
   insert into public.mobile_setlist_command_receipts(actor_id,team_id,member_id,command_id,setlist_id,command,payload_hash,result)
    values(actor,t,m,receipt_id,target_id,'{}',repeat('a',64),'{}');
  exception when sqlstate '42501' then assert position('mobile_setlist_command_receipts' in sqlerrm)>0,'INSERT denied by unrelated object';denied:=true;end;
  assert denied,'client role can INSERT fabricated receipt';
  denied:=false;begin update public.mobile_setlist_command_receipts set result='{}';exception when sqlstate '42501' then denied:=true;end;
  assert denied,'client role can UPDATE private receipts';
  denied:=false;begin delete from public.mobile_setlist_command_receipts;exception when sqlstate '42501' then denied:=true;end;
  assert denied,'client role can DELETE private receipts';
  if client_role='anon' then
   denied:=false;begin perform public.mobile_apply_setlist_commands(t,m,jsonb_build_array(command));exception when sqlstate '42501' then assert position('mobile_apply_setlist_commands' in sqlerrm)>0,'command RPC denied by unrelated object';denied:=true;end;
   assert denied,'anonymous role can execute command RPC';
   denied:=false;begin perform public.mobile_read_setlist_delete_scope(t,m,review_id);exception when sqlstate '42501' then assert position('mobile_read_setlist_delete_scope' in sqlerrm)>0,'scope RPC denied by unrelated object';denied:=true;end;
   assert denied,'anonymous role can execute deletion-scope RPC';
  end if;
  execute 'reset role';
 end loop;
 assert before_rows=(select coalesce(jsonb_agg(to_jsonb(r) order by actor_id,team_id,command_id),'[]'::jsonb) from public.mobile_setlist_command_receipts r), 'denied CRUD changed immutable receipts';
 assert not exists(select 1 from public.setlists where id=setlist_test.id(799)),'anonymous RPC changed a setlist';
 raise notice 'PASS authenticated/anonymous SELECT INSERT UPDATE DELETE denials, both anonymous RPC denials and unchanged receipt/setlist state';
end;
$$;
