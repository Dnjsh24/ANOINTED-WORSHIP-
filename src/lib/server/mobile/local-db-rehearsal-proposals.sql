\set ON_ERROR_STOP on
-- Continues only the disposable rehearsal fixture after its revocation assertions.
reset role;
select set_config('request.jwt.claim.sub',rehearsal_test.id(1)::text,false);
update public.team_members set status='active' where profile_id=rehearsal_test.id(3) and team_id=(select id from rehearsal_test.ids where key='team');
create function rehearsal_test.request_command(n integer) returns jsonb language sql as $$
 select rehearsal_test.command(n,'rehearsal.plan.save')||jsonb_build_object('type','rehearsal.plan.request','reason','Rehearse this intro together');
$$;
select set_config('request.jwt.claim.sub',rehearsal_test.id(3)::text,false);
set role authenticated;
do $$declare c jsonb; r jsonb; first_receipt jsonb; before_plan jsonb; request_id uuid; actor jsonb:=rehearsal_test.actor(); denied boolean;
begin
 before_plan:=rehearsal_test.workspace()->'plan';
 c:=rehearsal_test.request_command(120);
 c:=jsonb_set(c,'{value,allocations,0,focus}','"Longer intro requested by member"');
 c:=jsonb_set(c,'{value,tasks,2,assignee_member_id}',actor->'memberId');
 r:=rehearsal_test.capture('proposal-pending',c); first_receipt:=r;
 assert r->>'status'='applied' and r#>>'{request,status}'='pending','nonmanager proposal submission';
 assert r#>>'{request,request_nonce}'=c->>'commandId' and r#>>'{request,requested_by}'=actor->>'userId','proposal actor or nonce';
 assert r#>'{workspace,plan}'=before_plan and rehearsal_test.workspace()->'plan'=before_plan,'proposal applied shared plan';
 assert public.mobile_apply_rehearsal_commands((actor->>'teamId')::uuid,(actor->>'memberId')::uuid,jsonb_build_array(c))->0=first_receipt,'proposal exact retry';
 assert (select count(*)=1 from public.shared_edit_requests where request_nonce=(c->>'commandId')::uuid and requested_by=auth.uid()),'duplicate request';
 r:=rehearsal_test.capture('proposal-id-conflict',jsonb_set(c,'{reason}','"Different intent"'));
 assert r->>'code'='command_id_conflict','changed reason reused nonce';
 denied:=false; begin perform public.respond_preparation_task((c->>'setlistId')::uuid,c#>>'{value,tasks,2,key}',true); exception when insufficient_privilege then denied:=true; end;
 assert denied,'proposal task reassignment granted response rights';
 c:=rehearsal_test.request_command(121);
 request_id:=public.submit_shared_edit_request('rehearsal_plan',(c->>'setlistId')::uuid,(c#>>'{baseValue,revision}')::bigint,c->'value',c->>'reason',(c->>'commandId')::uuid);
 r:=rehearsal_test.capture('proposal-website-nonce-retry',c);
 assert r->>'status'='applied' and (r#>>'{request,id}')::uuid=request_id,'website nonce retry made another request';
 c:=rehearsal_test.request_command(122);
 request_id:=public.submit_shared_edit_request('rehearsal_plan',(c->>'setlistId')::uuid,(c#>>'{baseValue,revision}')::bigint,c->'value','Original website reason',(c->>'commandId')::uuid);
 r:=rehearsal_test.capture('proposal-website-nonce-collision',c); assert r->>'code'='invalid','changed website nonce intent accepted';
 c:=jsonb_set(rehearsal_test.request_command(123),'{dependsOn}',jsonb_build_array(rehearsal_test.id(999)));
 r:=rehearsal_test.capture('proposal-blocked',c); assert r->>'status'='blocked','unapplied dependency accepted';
 c:=rehearsal_test.request_command(124);
 perform set_config('request.jwt.claim.sub',rehearsal_test.id(1)::text,false);
 perform public.save_rehearsal_plan((c->>'setlistId')::uuid,(c#>>'{baseValue,revision}')::integer,'[]',c#>'{baseValue,tasks}');
 perform set_config('request.jwt.claim.sub',rehearsal_test.id(3)::text,false);
 before_plan:=rehearsal_test.workspace()->'plan';
 r:=rehearsal_test.capture('proposal-needs-revision',c);
 assert r->>'status'='applied' and r#>>'{request,status}'='needs_revision','stale proposal was dropped or falsely published';
 assert r#>'{request,changes}'=c->'value' and r#>>'{request,reason}'=c->>'reason','stale proposal lost draft';
 assert r#>'{workspace,plan}'=before_plan and rehearsal_test.workspace()->'plan'=before_plan,'stale proposal changed plan';
 c:=rehearsal_test.request_command(125); c:=jsonb_set(c,'{baseParent,setlistRevision}',to_jsonb((c#>>'{baseParent,setlistRevision}')::bigint+1));
 r:=rehearsal_test.capture('proposal-parent-conflict',c); assert r->>'status'='conflict','changed parent proposal accepted';
 denied:=false; begin perform public.mobile_apply_rehearsal_commands((actor->>'teamId')::uuid,rehearsal_test.id(999),jsonb_build_array(rehearsal_test.request_command(126))); exception when insufficient_privilege then denied:=true; end; assert denied,'wrong proposal member';
 c:=jsonb_set(rehearsal_test.request_command(127),'{baseValue,team_id}',to_jsonb(rehearsal_test.id(999)));
 denied:=false; begin perform public.mobile_apply_rehearsal_commands((actor->>'teamId')::uuid,(actor->>'memberId')::uuid,jsonb_build_array(c)); exception when invalid_parameter_value then denied:=true; end; assert denied,'foreign proposal base';
end$$;
reset role;
do $$declare actor jsonb:=rehearsal_test.actor(); c jsonb; denied boolean;
begin
 c:=rehearsal_test.request_command(128);
 update public.team_members set status='inactive' where id=(actor->>'memberId')::uuid;
 denied:=false; begin perform public.mobile_apply_rehearsal_commands((actor->>'teamId')::uuid,(actor->>'memberId')::uuid,jsonb_build_array(c)); exception when insufficient_privilege then denied:=true; end; assert denied,'revoked proposal member';
end$$;
select 'PASS nonmanager proposals, website nonce retries, unchanged plans, no task-right grants, stale needs_revision, original intent retention, dependencies and revoked-scope denial';
