-- DRAFT: native rehearsal snapshots and immutable compare-and-swap commands.
-- Reuses website actor-derived RPCs and the existing mobile setlist receipt ledger.
-- No hosted application authorized. Forward recovery retains receipts and queued bases.
begin;

create function private.mobile_rehearsal_snapshot(p_team uuid,p_member uuid,p_setlist uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_parent public.setlists%rowtype; v_event public.events%rowtype; v_result jsonb;
begin
 perform private.require_mobile_template_identity(p_team,p_member);
 select * into v_parent from public.setlists where id=p_setlist and team_id=p_team and deleted_at is null;
 if not found then raise exception 'Rehearsal setlist unavailable' using errcode='42501'; end if;
 -- Event before setlist follows existing workspace mutation lock order.
 if v_parent.event_id is not null then
  select * into v_event from public.events where id=v_parent.event_id and team_id=p_team and deleted_at is null for share;
  if not found or v_event.approval_status<>'approved' then raise exception 'Confirmed rehearsal event required' using errcode='42501'; end if;
 end if;
 perform 1 from public.setlists where id=p_setlist and team_id=p_team and deleted_at is null and event_id is not distinct from v_parent.event_id for update;
 if not found then raise exception 'Rehearsal parent changed' using errcode='40001'; end if;
 select * into v_parent from public.setlists where id=p_setlist;
 perform 1 from public.setlist_songs where setlist_id=p_setlist order by id for share;
 perform 1 from public.rehearsal_plans where setlist_id=p_setlist for share;
 if v_parent.event_id is not null then perform 1 from public.event_assignments where event_id=v_parent.event_id order by id for share; end if;
 select jsonb_build_object('setlistId',v_parent.id,'teamId',p_team,'setlistRevision',v_parent.sync_revision,
  'eventId',v_parent.event_id,'eventRevision',case when v_parent.event_id is null then null else v_event.sync_revision end,
  'slots',coalesce((select jsonb_agg(jsonb_build_object('id',ss.id,'songId',ss.song_id,'revision',ss.sync_revision) order by ss.id)
    from public.setlist_songs ss where ss.setlist_id=p_setlist and ss.deleted_at is null),'[]'::jsonb),
  'plan',coalesce((select to_jsonb(p) from public.rehearsal_plans p where p.setlist_id=p_setlist and p.team_id=p_team),'null'::jsonb),
  'checks',coalesce((select jsonb_agg(to_jsonb(r) order by r.task_key,r.team_member_id) from public.rehearsal_task_responses r where r.setlist_id=p_setlist),'[]'::jsonb),
  'readiness',coalesce((select jsonb_agg(to_jsonb(r) order by r.slot_id,r.team_member_id) from public.song_readiness r
    where r.event_id=v_parent.event_id and exists(select 1 from public.setlist_songs ss where ss.id=r.slot_id and ss.setlist_id=p_setlist and ss.deleted_at is null)),'[]'::jsonb),
  'members',coalesce((select jsonb_agg(jsonb_build_object('id',tm.id,'name',coalesce(pr.full_name,'Team member')) order by tm.id)
    from public.team_members tm left join public.profiles pr on pr.id=tm.profile_id where tm.team_id=p_team and tm.status='active'),'[]'::jsonb),
  'assignedMemberIds',coalesce((select jsonb_agg(member_id order by member_id) from (
    select distinct a.team_member_id as member_id from public.event_assignments a join public.team_members tm on tm.id=a.team_member_id
      and tm.team_id=p_team and tm.status='active' where a.event_id=v_parent.event_id) assigned),'[]'::jsonb)
 ) into v_result;
 if octet_length(v_result::text)>8388608 then raise exception 'Rehearsal workspace exceeds download limit' using errcode='54000'; end if;
 return v_result;
end;
$$;
revoke all on function private.mobile_rehearsal_snapshot(uuid,uuid,uuid) from public,anon,authenticated;

create function public.mobile_read_rehearsal_workspace(p_team_id uuid,p_member_id uuid,p_setlist_id uuid) returns jsonb
language sql security definer set search_path='' as $$ select private.mobile_rehearsal_snapshot(p_team_id,p_member_id,p_setlist_id); $$;
revoke all on function public.mobile_read_rehearsal_workspace(uuid,uuid,uuid) from public,anon;
grant execute on function public.mobile_read_rehearsal_workspace(uuid,uuid,uuid) to authenticated;

create function private.validate_mobile_rehearsal_command(p_command jsonb,p_team uuid,p_member uuid) returns void
language plpgsql set search_path='' as $$
declare v_type text:=p_command->>'type'; v_common text[]:=array['commandId','setlistId','type','baseParent','baseValue','dependsOn'];
 v_parent jsonb:=p_command->'baseParent'; v_item jsonb; v_id uuid;
begin
 if v_type='rehearsal.plan.save' then
  perform private.validate_mobile_service_object(p_command,v_common||array['value']);
  perform private.validate_mobile_service_object(p_command->'value',array['allocations','tasks']);
  if jsonb_typeof(p_command#>'{value,allocations}') is distinct from 'array' or jsonb_array_length(p_command#>'{value,allocations}')>200
    or jsonb_typeof(p_command#>'{value,tasks}') is distinct from 'array' or jsonb_array_length(p_command#>'{value,tasks}')<>10 then raise exception 'Invalid rehearsal plan' using errcode='22023'; end if;
 elsif v_type='rehearsal.task.respond' then
  perform private.validate_mobile_service_object(p_command,v_common||array['basePlan','taskKey','completed']);
  if jsonb_typeof(p_command->'completed') is distinct from 'boolean' or jsonb_typeof(p_command->'taskKey') is distinct from 'string'
    or length(p_command->>'taskKey')>160 or jsonb_typeof(p_command->'basePlan') is distinct from 'object' then raise exception 'Invalid preparation response' using errcode='22023'; end if;
 elsif v_type='rehearsal.readiness.respond' then
  perform private.validate_mobile_service_object(p_command,v_common||array['slotId','state','note']);
  if jsonb_typeof(p_command->'slotId') is distinct from 'string' or jsonb_typeof(p_command->'state') is distinct from 'string'
    or p_command->>'state' not in ('not_started','practicing','ready','needs_help') or jsonb_typeof(p_command->'note') is distinct from 'string'
    or length(p_command->>'note')>500 then raise exception 'Invalid readiness response' using errcode='22023'; end if;
  v_id:=(p_command->>'slotId')::uuid;
 else raise exception 'Invalid rehearsal command type' using errcode='22023'; end if;
 perform private.validate_mobile_service_object(v_parent,array['setlistId','teamId','eventId','eventRevision','setlistRevision','slots']);
 if jsonb_typeof(p_command->'commandId') is distinct from 'string' or jsonb_typeof(p_command->'setlistId') is distinct from 'string'
   or jsonb_typeof(v_parent->'teamId') is distinct from 'string' or jsonb_typeof(v_parent->'setlistId') is distinct from 'string'
   or (v_parent->>'teamId')::uuid<>p_team or (v_parent->>'setlistId')::uuid<>(p_command->>'setlistId')::uuid
   or jsonb_typeof(p_command->'dependsOn') is distinct from 'array' or jsonb_array_length(p_command->'dependsOn')>25
   or jsonb_typeof(v_parent->'slots') is distinct from 'array' or jsonb_array_length(v_parent->'slots')>200
   or jsonb_typeof(v_parent->'setlistRevision') is distinct from 'number' or (v_parent->>'setlistRevision')::numeric not between 1 and 9007199254740991
   or mod((v_parent->>'setlistRevision')::numeric,1)<>0 then raise exception 'Invalid rehearsal parent' using errcode='22023'; end if;
 v_id:=(p_command->>'commandId')::uuid; v_id:=(p_command->>'setlistId')::uuid;
 if v_parent->'eventId'<>'null'::jsonb then
  v_id:=(v_parent->>'eventId')::uuid;
  if jsonb_typeof(v_parent->'eventRevision') is distinct from 'number' or (v_parent->>'eventRevision')::numeric not between 1 and 9007199254740991
    or mod((v_parent->>'eventRevision')::numeric,1)<>0 then raise exception 'Invalid rehearsal event revision' using errcode='22023'; end if;
 elsif v_parent->'eventRevision'<>'null'::jsonb then raise exception 'Invalid rehearsal event' using errcode='22023'; end if;
 for v_item in select value from jsonb_array_elements(v_parent->'slots') loop
  perform private.validate_mobile_service_object(v_item,array['id','songId','revision']);
  v_id:=(v_item->>'id')::uuid; v_id:=(v_item->>'songId')::uuid;
  if jsonb_typeof(v_item->'revision') is distinct from 'number' or (v_item->>'revision')::numeric not between 1 and 9007199254740991
    or mod((v_item->>'revision')::numeric,1)<>0 then raise exception 'Invalid rehearsal slot revision' using errcode='22023'; end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(v_parent->'slots')) then raise exception 'Duplicate rehearsal slot' using errcode='22023'; end if;
 for v_item in select value from jsonb_array_elements(p_command->'dependsOn') loop
  if jsonb_typeof(v_item) is distinct from 'string' or (v_item#>>'{}')::uuid=(p_command->>'commandId')::uuid then raise exception 'Invalid dependency' using errcode='22023'; end if;
 end loop;
 if (select count(*)<>count(distinct value) from jsonb_array_elements(p_command->'dependsOn')) then raise exception 'Duplicate dependency' using errcode='22023'; end if;
 if jsonb_typeof(p_command->'baseValue') not in ('object','null') then raise exception 'Invalid rehearsal base' using errcode='22023'; end if;
 if p_command->'baseValue'<>'null'::jsonb then
  if v_type='rehearsal.plan.save' then
   if (p_command#>>'{baseValue,team_id}')::uuid is distinct from p_team or (p_command#>>'{baseValue,setlist_id}')::uuid is distinct from (p_command->>'setlistId')::uuid then raise exception 'Foreign plan base' using errcode='22023'; end if;
  elsif (p_command#>>'{baseValue,team_member_id}')::uuid is distinct from p_member then raise exception 'Foreign response base' using errcode='22023'; end if;
 end if;
end;
$$;
revoke all on function private.validate_mobile_rehearsal_command(jsonb,uuid,uuid) from public,anon,authenticated;

create function private.apply_mobile_rehearsal_command(p_team uuid,p_member uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=(p_command->>'commandId')::uuid; v_setlist uuid:=(p_command->>'setlistId')::uuid; v_type text:=p_command->>'type';
 v_hash text:=encode(pg_catalog.sha256(pg_catalog.convert_to(p_command::text,'UTF8')),'hex'); v_common jsonb; v_result jsonb; v_snapshot jsonb; v_parent jsonb;
 v_receipt public.mobile_setlist_command_receipts%rowtype; v_dependency jsonb; v_base jsonb; v_current jsonb; v_plan public.rehearsal_plans%rowtype;
begin
 perform private.require_mobile_template_identity(p_team,p_member);
 v_common:=jsonb_build_object('commandId',v_id,'setlistId',v_setlist,'type',v_type,'payloadHash',v_hash);
 -- Receipt replay rechecks current parent/membership visibility before returning any historical content.
 v_snapshot:=private.mobile_rehearsal_snapshot(p_team,p_member,v_setlist);
 select * into v_receipt from public.mobile_setlist_command_receipts where actor_id=auth.uid() and team_id=p_team and command_id=v_id;
 if found then
  if v_receipt.member_id<>p_member or v_receipt.command is distinct from p_command or v_receipt.payload_hash<>v_hash then
   return v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This command ID belongs to another saved intent.');
  end if;
  if v_receipt.result ? 'workspace' and (v_receipt.result#>'{workspace,eventId}' is distinct from v_snapshot->'eventId'
    or exists(select 1 from jsonb_array_elements(v_receipt.result#>'{workspace,slots}') old_slot where not exists(
      select 1 from jsonb_array_elements(v_snapshot->'slots') current_slot where old_slot->>'id'=current_slot->>'id' and old_slot->>'songId'=current_slot->>'songId'))) then
   raise exception 'Historical rehearsal content is no longer visible in this parent' using errcode='42501';
  end if;
  return v_receipt.result;
 end if;
 if exists(select 1 from public.mobile_workflow_command_receipts where actor_id=auth.uid() and team_id=p_team and command_id=v_id)
   or exists(select 1 from public.mobile_command_receipts where actor_id=auth.uid() and team_id=p_team and command_id=v_id) then
  return v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This ID belongs to another mobile workflow.');
 end if;
 for v_dependency in select value from jsonb_array_elements(p_command->'dependsOn') loop
  if not exists(select 1 from public.mobile_setlist_command_receipts where actor_id=auth.uid() and team_id=p_team and member_id=p_member
    and command_id=(v_dependency#>>'{}')::uuid and result->>'status'='applied') then
   v_result:=v_common||jsonb_build_object('status','blocked','code','dependency','message','A required rehearsal change is not confirmed.'); exit;
  end if;
 end loop;
 if v_result is null then
  begin
   if v_type='rehearsal.plan.save' and not private.has_workspace_permission(p_team,'setlists.manage') then raise exception 'Setlist manager required' using errcode='42501'; end if;
   if v_type='rehearsal.task.respond' and not exists(select 1 from jsonb_array_elements(v_snapshot#>'{plan,tasks}') task
     where task->>'key'=p_command->>'taskKey' and (task->>'assignee_member_id')::uuid=p_member) then raise exception 'Own assigned task required' using errcode='42501'; end if;
   if v_type='rehearsal.readiness.respond' and (not exists(select 1 from jsonb_array_elements(v_snapshot->'assignedMemberIds') m where (m#>>'{}')::uuid=p_member)
     or not exists(select 1 from jsonb_array_elements(v_snapshot->'slots') s where (s->>'id')::uuid=(p_command->>'slotId')::uuid)) then raise exception 'Own event assignment and current slot required' using errcode='42501'; end if;
   v_parent:=v_snapshot-array['plan','checks','readiness','members','assignedMemberIds'];
   if v_parent is distinct from p_command->'baseParent' then raise exception 'Rehearsal parent changed' using errcode='40001'; end if;
   if v_type='rehearsal.plan.save' then
    v_base:=case when p_command->'baseValue'='null'::jsonb then 'null'::jsonb else to_jsonb(jsonb_populate_record(null::public.rehearsal_plans,p_command->'baseValue')) end;
    if v_base is distinct from v_snapshot->'plan' then raise exception 'Rehearsal plan changed' using errcode='40001'; end if;
    perform public.save_rehearsal_plan(v_setlist,coalesce((v_snapshot#>>'{plan,revision}')::integer,0),p_command#>'{value,allocations}',p_command#>'{value,tasks}');
   elsif v_type='rehearsal.task.respond' then
    if to_jsonb(jsonb_populate_record(null::public.rehearsal_plans,p_command->'basePlan')) is distinct from v_snapshot->'plan' then raise exception 'Task assignments changed' using errcode='40001'; end if;
    select value into v_current from jsonb_array_elements(v_snapshot->'checks') where value->>'task_key'=p_command->>'taskKey' and (value->>'team_member_id')::uuid=p_member;
    v_base:=case when p_command->'baseValue'='null'::jsonb then 'null'::jsonb else to_jsonb(jsonb_populate_record(null::public.rehearsal_task_responses,p_command->'baseValue')) end;
    if v_base is distinct from coalesce(v_current,'null'::jsonb) then raise exception 'Preparation response changed' using errcode='40001'; end if;
    perform public.respond_preparation_task(v_setlist,p_command->>'taskKey',(p_command->>'completed')::boolean);
   else
    select value into v_current from jsonb_array_elements(v_snapshot->'readiness') where (value->>'slot_id')::uuid=(p_command->>'slotId')::uuid and (value->>'team_member_id')::uuid=p_member;
    v_base:=case when p_command->'baseValue'='null'::jsonb then 'null'::jsonb else to_jsonb(jsonb_populate_record(null::public.song_readiness,p_command->'baseValue')) end;
    if v_base is distinct from coalesce(v_current,'null'::jsonb) then raise exception 'Readiness response changed' using errcode='40001'; end if;
    perform public.respond_song_readiness((p_command->>'slotId')::uuid,p_command->>'state',p_command->>'note');
   end if;
   v_result:=v_common||jsonb_build_object('status','applied','workspace',private.mobile_rehearsal_snapshot(p_team,p_member,v_setlist));
  exception when sqlstate '40001' then
   v_result:=v_common||jsonb_build_object('status','conflict','workspace',v_snapshot,'original',p_command);
  when sqlstate '42501' then v_result:=v_common||jsonb_build_object('status','rejected','code','permission','message','Current rehearsal permission or assignment is required. Your saved intent is retained.');
  when sqlstate '22023' or sqlstate '22P02' or sqlstate '23514' then v_result:=v_common||jsonb_build_object('status','rejected','code','invalid','message','Review rehearsal fields and current task assignees. Your saved intent is retained.');
  end;
 end if;
 insert into public.mobile_setlist_command_receipts(actor_id,team_id,member_id,command_id,setlist_id,command,payload_hash,result)
   values(auth.uid(),p_team,p_member,v_id,v_setlist,p_command,v_hash,v_result);
 return v_result;
end;
$$;
revoke all on function private.apply_mobile_rehearsal_command(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.mobile_apply_rehearsal_commands(p_team_id uuid,p_member_id uuid,p_commands jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_command jsonb; v_dependency jsonb; v_index bigint; v_results jsonb:='[]';
begin
 perform private.require_mobile_template_identity(p_team_id,p_member_id);
 if p_commands is null or jsonb_typeof(p_commands)<>'array' or jsonb_array_length(p_commands) not between 1 and 10 or octet_length(p_commands::text)>1048576 then raise exception 'Invalid rehearsal batch' using errcode='22023'; end if;
 for v_command in select value from jsonb_array_elements(p_commands) loop perform private.validate_mobile_rehearsal_command(v_command,p_team_id,p_member_id); end loop;
 if (select count(*)<>count(distinct value->>'commandId') from jsonb_array_elements(p_commands)) then raise exception 'Duplicate command ID' using errcode='22023'; end if;
 for v_command,v_index in select value,ordinality from jsonb_array_elements(p_commands) with ordinality loop
  for v_dependency in select value from jsonb_array_elements(v_command->'dependsOn') loop
   if exists(select 1 from jsonb_array_elements(p_commands) with ordinality d(value,n) where n>=v_index and (value->>'commandId')::uuid=(v_dependency#>>'{}')::uuid) then raise exception 'Dependencies must precede commands' using errcode='22023'; end if;
  end loop;
 end loop;
 for v_command in select value from jsonb_array_elements(p_commands) loop v_results:=v_results||jsonb_build_array(private.apply_mobile_rehearsal_command(p_team_id,p_member_id,v_command)); end loop;
 return v_results;
end;
$$;
revoke all on function public.mobile_apply_rehearsal_commands(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_rehearsal_commands(uuid,uuid,jsonb) to authenticated;
commit;
