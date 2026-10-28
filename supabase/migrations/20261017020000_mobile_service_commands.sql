-- DRAFT: shared website services with durable, scoped mobile confirmations.
-- Apply only as part of an explicitly authorized, reviewed backend release.
-- Additive functions only; preserve prior receipts, response history and v1 RPCs.
begin;

-- The owner-permission override migration revoked this policy helper's earlier
-- authenticated grant. RLS evaluates it as the caller even for own requests.
-- Restore only the original boolean predicate permission; its own membership
-- checks and the complete request SELECT policy remain unchanged.
grant execute on function private.can_review_shared_edit(uuid,text) to authenticated;

create function private.validate_mobile_service_object(p_value jsonb,p_keys text[]) returns void
language plpgsql set search_path='' as $$
begin
 if coalesce(jsonb_typeof(p_value),'')<>'object' or p_value-p_keys<>'{}'::jsonb or not(p_value ?& p_keys) then
  raise exception 'Invalid service command fields' using errcode='22023';
 end if;
end;
$$;
revoke all on function private.validate_mobile_service_object(jsonb,text[]) from public,anon,authenticated;

create function private.validate_mobile_service_order(p_entries jsonb,p_roles jsonb) returns void
language plpgsql set search_path='' as $$
declare v_item jsonb;
begin
 if coalesce(jsonb_typeof(p_entries),'')<>'array' or jsonb_array_length(p_entries)>200
  or octet_length(p_entries::text)>500000 or coalesce(jsonb_typeof(p_roles),'')<>'array' then
  raise exception 'Invalid service order lists' using errcode='22023';
 end if;
 -- Reuse the website's structural validator without imposing its smaller
 -- proposal-byte limit on a legal directly saved order (up to 500000 bytes).
 perform private.validate_shared_edit_changes('service_order',jsonb_build_object('required_roles',p_roles));
 for v_item in select value from jsonb_array_elements(p_entries) loop
  perform private.validate_shared_edit_changes('service_order',jsonb_build_object('entries',jsonb_build_array(v_item)));
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_entries)) then
  raise exception 'Duplicate service entry IDs' using errcode='22023';
 end if;
end;
$$;
revoke all on function private.validate_mobile_service_order(jsonb,jsonb) from public,anon,authenticated;

create function private.validate_mobile_service_command(p_command jsonb) returns void
language plpgsql set search_path='' as $$
declare v_type text:=p_command->>'type'; v_key text; v_value jsonb; v_base jsonb; v_dependency jsonb;
 v_common text[]:=array['commandId','eventId','baseEventRevision','dependsOn','type','value'];
begin
 if v_type in ('service.order.save','service.order.request') then
  perform private.validate_mobile_service_object(p_command,v_common||array['baseOrder']||case when v_type='service.order.request' then array['reason'] else array[]::text[] end);
 else
  if v_type is distinct from 'service.assignment.respond' then raise exception 'Unsupported service command' using errcode='22023'; end if;
  perform private.validate_mobile_service_object(p_command,v_common||array['baseAssignment','baseResponse','responseVersion']);
 end if;
 foreach v_key in array array['commandId','eventId'] loop
  if jsonb_typeof(p_command->v_key)<>'string' or p_command->>v_key!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
   raise exception 'Invalid service identity' using errcode='22023';
  end if;
 end loop;
 if jsonb_typeof(p_command->'baseEventRevision')<>'number' or (p_command->>'baseEventRevision')::numeric not between 0 and 9007199254740991
  or (p_command->>'baseEventRevision')::numeric<>trunc((p_command->>'baseEventRevision')::numeric)
  or jsonb_typeof(p_command->'dependsOn')<>'array' or jsonb_array_length(p_command->'dependsOn')>25 then
  raise exception 'Invalid service base or dependencies' using errcode='22023';
 end if;
 for v_dependency in select value from jsonb_array_elements(p_command->'dependsOn') loop
  if jsonb_typeof(v_dependency)<>'string' then raise exception 'Invalid service dependency' using errcode='22023'; end if;
  perform (v_dependency#>>'{}')::uuid;
 end loop;
 if (select count(*)<>count(distinct (value#>>'{}')::uuid) from jsonb_array_elements(p_command->'dependsOn')) then
  raise exception 'Duplicate service dependencies' using errcode='22023';
 end if;
 v_value:=p_command->'value';
 if v_type='service.assignment.respond' then
  v_base:=p_command->'baseAssignment';
  perform private.validate_mobile_service_object(v_base,array['id','eventId','memberId','assignment']);
  foreach v_key in array array['id','eventId','memberId'] loop
   if jsonb_typeof(v_base->v_key)<>'string' then raise exception 'Invalid assignment base' using errcode='22023'; end if;
   perform (v_base->>v_key)::uuid;
  end loop;
  if jsonb_typeof(v_base->'assignment')<>'string' or length(v_base->>'assignment')>160
   or (v_base->>'eventId')::uuid<>(p_command->>'eventId')::uuid then raise exception 'Invalid assignment base' using errcode='22023'; end if;
  perform private.validate_mobile_service_object(p_command->'responseVersion',array['assignmentId','memberId','revision','deleted']);
  if jsonb_typeof(p_command->'responseVersion'->'revision')<>'number'
   or (p_command->'responseVersion'->>'revision')::numeric not between 0 and 9007199254740991
   or (p_command->'responseVersion'->>'revision')::numeric<>trunc((p_command->'responseVersion'->>'revision')::numeric)
   or jsonb_typeof(p_command->'responseVersion'->'deleted')<>'boolean'
   or p_command->'responseVersion'->>'assignmentId' is distinct from v_base->>'id'
   or p_command->'responseVersion'->>'memberId' is distinct from v_base->>'memberId'
   or (p_command->'responseVersion'->>'deleted')::boolean is distinct from (p_command->'baseResponse'='null'::jsonb)
   or ((p_command->'responseVersion'->>'revision')::bigint=0 and not (p_command->'responseVersion'->>'deleted')::boolean) then
   raise exception 'Invalid saved response version' using errcode='22023';
  end if;
  for v_value in select value from jsonb_array_elements(jsonb_build_array(p_command->'value',p_command->'baseResponse')) where value<>'null'::jsonb loop
   perform private.validate_mobile_service_object(v_value,array['state','note']);
   if jsonb_typeof(v_value->'state')<>'string' or v_value->>'state' not in ('pending','confirmed','declined')
    or jsonb_typeof(v_value->'note')<>'string' or length(v_value->>'note')>500 then raise exception 'Invalid response' using errcode='22023'; end if;
  end loop;
  -- A null local value is not a response; only the original base may be null.
  perform private.validate_mobile_service_object(p_command->'value',array['state','note']);
 else
  perform private.validate_mobile_service_object(v_value,array['entries','requiredRoles']);
  perform private.validate_mobile_service_order(v_value->'entries',v_value->'requiredRoles');
  v_base:=p_command->'baseOrder';
  if v_base<>'null'::jsonb then
   perform private.validate_mobile_service_object(v_base,array['event_id','team_id','revision','entries','required_roles','updated_by','updated_at']);
   foreach v_key in array array['event_id','team_id','updated_by'] loop
    if jsonb_typeof(v_base->v_key)<>'string' then raise exception 'Invalid order base identity' using errcode='22023'; end if;
    perform (v_base->>v_key)::uuid;
   end loop;
   if (v_base->>'event_id')::uuid<>(p_command->>'eventId')::uuid or jsonb_typeof(v_base->'revision')<>'number'
    or (v_base->>'revision')::numeric not between 1 and 9007199254740991 or (v_base->>'revision')::numeric<>trunc((v_base->>'revision')::numeric)
    or jsonb_typeof(v_base->'updated_at')<>'string' then raise exception 'Invalid order base revision' using errcode='22023'; end if;
   perform (v_base->>'updated_at')::timestamptz;
   perform private.validate_mobile_service_order(v_base->'entries',v_base->'required_roles');
  end if;
  if v_type='service.order.request' then
   if jsonb_typeof(p_command->'reason')<>'string' or length(trim(p_command->>'reason')) not between 1 and 1000 then raise exception 'Invalid proposal reason' using errcode='22023'; end if;
   perform private.validate_shared_edit_changes('service_order',jsonb_build_object('entries',v_value->'entries','required_roles',v_value->'requiredRoles'));
  end if;
 end if;
end;
$$;
revoke all on function private.validate_mobile_service_command(jsonb) from public,anon,authenticated;

create function private.apply_mobile_service_command(p_team uuid,p_member uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_id uuid:=(p_command->>'commandId')::uuid; v_event_id uuid:=(p_command->>'eventId')::uuid;
 v_type text:=p_command->>'type'; v_hash text:=encode(pg_catalog.sha256(pg_catalog.convert_to(p_command::text,'UTF8')),'hex');
 v_common jsonb; v_result jsonb; v_dependency jsonb; v_base jsonb; v_local jsonb; v_remote jsonb; v_version jsonb;
 v_event public.events%rowtype; v_order public.service_orders%rowtype; v_assignment public.event_assignments%rowtype;
 v_response public.assignment_responses%rowtype; v_state public.mobile_service_assignment_state%rowtype;
 v_receipt public.mobile_workflow_command_receipts%rowtype; v_request public.shared_edit_requests%rowtype; v_request_id uuid;
 v_assignment_value jsonb:='null'; v_response_value jsonb:='null'; v_revision bigint; v_permission boolean;
begin
 v_common:=jsonb_build_object('commandId',v_id,'eventId',v_event_id,'type',v_type,'payloadHash',v_hash);
 -- Match website setlist -> event -> order/assignment lock order. Membership
 -- and all proposal nonce locks are already held by the public batch boundary.
 perform 1 from public.setlists where event_id=v_event_id and team_id=p_team order by id for update;
 select * into v_event from public.events where id=v_event_id and team_id=p_team for update;
 select * into v_order from public.service_orders where event_id=v_event_id and team_id=p_team for update;
 v_permission:=v_type<>'service.order.save' or private.has_workspace_permission(p_team,'events.manage');
 if v_type='service.assignment.respond' then
  select * into v_assignment from public.event_assignments where id=(p_command->'baseAssignment'->>'id')::uuid
   and event_id=v_event_id and team_member_id=p_member for update;
  v_permission:=v_assignment.id is not null;
 end if;
 if not v_permission then
  v_result:=v_common||jsonb_build_object('status','rejected','code','permission','message','Current workspace permission or your assignment is required. Keep your draft.');
 elsif v_event.id is null or v_event.deleted_at is not null or v_event.approval_status<>'approved' then
  v_result:=v_common||jsonb_build_object('status','rejected','code','unavailable','message','This approved event is unavailable. Keep your draft.');
 end if;
 select * into v_receipt from public.mobile_workflow_command_receipts where actor_id=v_actor and team_id=p_team and command_id=v_id;
 if found then
  if v_receipt.member_id<>p_member or v_receipt.payload_hash<>v_hash or v_receipt.command<>p_command then
   return v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This command ID already belongs to another saved intent.');
  end if;
  -- Never return prior private result bodies after access is revoked.
  if v_result is not null then return v_result; end if;
  return v_receipt.result;
 end if;
 if v_result is null then
  for v_dependency in select value from jsonb_array_elements(p_command->'dependsOn') loop
   if not exists(select 1 from public.mobile_workflow_command_receipts where actor_id=v_actor and team_id=p_team and member_id=p_member
    and command_id=(v_dependency#>>'{}')::uuid and result->>'status'='applied') then
    v_result:=v_common||jsonb_build_object('status','blocked','code','dependency','message','A required command is not confirmed. Resolve it and use a new command ID.'); exit;
   end if;
  end loop;
 end if;
 if v_result is null then
  if v_type='service.assignment.respond' then
   select * into v_response from public.assignment_responses where assignment_id=v_assignment.id for update;
   -- Assignment/member is the durable namespace. A moved assignment's deleted
   -- response may still name its former event; never replace that revision by 0.
   select * into v_state from public.mobile_service_assignment_state where assignment_id=v_assignment.id and member_id=p_member for update;
   if (v_state.assignment_id is null and v_response.assignment_id is not null)
    or (v_state.assignment_id is not null and (v_state.team_id<>p_team or v_state.actor_id<>v_actor
     or v_state.deleted is distinct from (v_response.assignment_id is null)
     or (not v_state.deleted and (v_state.event_id<>v_event_id or v_response.team_member_id<>p_member or v_state.revision<>v_response.sync_revision)))) then
    raise exception 'Response state changed. Retry with the same command IDs.' using errcode='40001';
   end if;
   v_assignment_value:=jsonb_build_object('id',v_assignment.id,'eventId',v_event_id,'memberId',p_member,'assignment',v_assignment.assignment);
   if v_response.assignment_id is not null then v_response_value:=to_jsonb(v_response); end if;
   v_version:=jsonb_build_object('assignmentId',v_assignment.id,'memberId',p_member,'revision',coalesce(v_state.revision,0),'deleted',coalesce(v_state.deleted,true));
   v_base:=jsonb_build_object('assignment',p_command->'baseAssignment','response',p_command->'baseResponse','responseVersion',p_command->'responseVersion');
   v_local:=p_command->'value';
   v_remote:=jsonb_build_object('event',private.mobile_event_snapshot(p_team,v_event_id)->'record','order',null,
    'assignment',v_assignment_value,'response',v_response_value,'responseVersion',v_version);
   if v_assignment_value is distinct from p_command->'baseAssignment' or v_version is distinct from p_command->'responseVersion'
    or (case when v_response.assignment_id is null then 'null'::jsonb else jsonb_build_object('state',v_response.state,'note',v_response.note) end) is distinct from p_command->'baseResponse' then
    v_result:=v_common||jsonb_build_object('status','conflict','baseValue',v_base,'localValue',v_local,'remote',v_remote);
   end if;
  else
   v_revision:=coalesce((p_command->'baseOrder'->>'revision')::bigint,0);
   v_base:=p_command->'baseOrder'; v_local:=p_command->'value';
   if v_type='service.order.request' then v_local:=v_local||jsonb_build_object('reason',p_command->'reason'); end if;
   v_remote:=jsonb_build_object('event',private.mobile_event_snapshot(p_team,v_event_id)->'record',
    'order',case when v_order.event_id is null then 'null'::jsonb else to_jsonb(v_order) end,'assignment',null,'response',null,'responseVersion',null);
   -- Website order CAS is independent of unrelated parent event edits. A stale
   -- proposal still goes through the website's needs_revision submission flow.
   if v_type='service.order.save' and v_revision<>coalesce(v_order.revision,0) then
    v_result:=v_common||jsonb_build_object('status','conflict','baseValue',v_base,'localValue',v_local,'remote',v_remote);
   end if;
  end if;
  if v_result is null then
   begin
    if v_type='service.order.save' then
     perform public.save_service_order(v_event_id,v_revision::integer,p_command->'value'->'entries',array(select jsonb_array_elements_text(p_command->'value'->'requiredRoles')));
     select * into v_order from public.service_orders where event_id=v_event_id and team_id=p_team;
     v_result:=v_common||jsonb_build_object('status','applied','outcome',jsonb_build_object('kind','order','order',to_jsonb(v_order)));
    elsif v_type='service.order.request' then
     v_request_id:=public.submit_shared_edit_request('service_order',v_event_id,v_revision,
      jsonb_build_object('entries',p_command->'value'->'entries','required_roles',p_command->'value'->'requiredRoles'),p_command->>'reason',v_id);
     select * into v_request from public.shared_edit_requests where id=v_request_id and team_id=p_team and requested_by=v_actor;
     if v_request.status not in ('pending','needs_revision') or v_request.reviewed_by is not null or v_request.reviewed_at is not null then
      -- Existing web nonce already reviewed: retain the draft, do not invent a
      -- new pending request or claim that a proposal changed the running order.
      v_result:=v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This request was already reviewed. Open requests and keep your draft.');
     else
      v_result:=v_common||jsonb_build_object('status','applied','outcome',jsonb_build_object('kind','request','request',to_jsonb(v_request)));
     end if;
    else
     perform public.respond_assignment(v_assignment.id,p_command->'value'->>'state',p_command->'value'->>'note');
     select * into v_response from public.assignment_responses where assignment_id=v_assignment.id and team_member_id=p_member;
     v_version:=jsonb_build_object('assignmentId',v_assignment.id,'memberId',p_member,'revision',v_response.sync_revision,'deleted',false);
     v_result:=v_common||jsonb_build_object('status','applied','outcome',jsonb_build_object('kind','assignment','assignment',v_assignment_value,'response',to_jsonb(v_response),'responseVersion',v_version));
    end if;
   exception when sqlstate '42501' then
    v_result:=v_common||jsonb_build_object('status','rejected','code','permission','message','Current permissions or related records prevent this change. Keep your draft.');
   when sqlstate '22023' or sqlstate '22P02' or sqlstate '22007' or sqlstate '22008' or sqlstate '23514' or sqlstate '23503' or sqlstate '22003' then
    v_result:=v_common||jsonb_build_object('status','rejected','code','invalid','message','Review this service change and its related records. Keep your draft.');
   end;
  end if;
 end if;
 insert into public.mobile_workflow_command_receipts(actor_id,team_id,member_id,command_id,event_id,command,payload_hash,result)
  values(v_actor,p_team,p_member,v_id,v_event_id,p_command,v_hash,v_result);
 return v_result;
end;
$$;
revoke all on function private.apply_mobile_service_command(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.mobile_apply_service_commands(p_team_id uuid,p_member_id uuid,p_commands jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_command jsonb; v_results jsonb:='[]'; v_index bigint; v_dependency jsonb; v_nonce uuid;
begin
 if auth.uid() is null or p_team_id is null or p_member_id is null then raise exception 'Selected authenticated workspace required' using errcode='42501'; end if;
 if p_commands is null or jsonb_typeof(p_commands)<>'array' or jsonb_array_length(p_commands) not between 1 and 25 or octet_length(p_commands::text)>1048576 then
  raise exception 'Invalid service batch' using errcode='22023';
 end if;
 for v_command in select value from jsonb_array_elements(p_commands) loop
  perform private.validate_mobile_service_command(v_command);
  if (v_command->>'type'='service.assignment.respond' and (v_command->'baseAssignment'->>'memberId')::uuid<>p_member_id)
   or (v_command->>'type'<>'service.assignment.respond' and v_command->'baseOrder'<>'null'::jsonb and (v_command->'baseOrder'->>'team_id')::uuid<>p_team_id) then
   raise exception 'Service base belongs to another workspace or membership' using errcode='22023';
  end if;
 end loop;
 if (select count(*)<>count(distinct (value->>'commandId')::uuid) from jsonb_array_elements(p_commands)) then raise exception 'Duplicate service command IDs' using errcode='22023'; end if;
 for v_command,v_index in select value,ordinality from jsonb_array_elements(p_commands) with ordinality loop
  for v_dependency in select value from jsonb_array_elements(v_command->'dependsOn') loop
   if exists(select 1 from jsonb_array_elements(p_commands) with ordinality d(value,n) where n>=v_index and (value->>'commandId')::uuid=(v_dependency#>>'{}')::uuid) then
    raise exception 'Service dependencies must precede their commands' using errcode='22023';
   end if;
  end loop;
 end loop;
 -- Website submissions lock their actor/nonce before parent rows. Acquire all
 -- batch nonces in a fixed order first, so retried web/mobile proposals cannot
 -- invert that order while the mobile transaction holds workspace/parent locks.
 for v_nonce in select (value->>'commandId')::uuid from jsonb_array_elements(p_commands) where value->>'type'='service.order.request' order by (value->>'commandId')::uuid loop
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||v_nonce::text,0));
 end loop;
 perform private.lock_workspace_members(p_team_id);
 if not exists(select 1 from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=auth.uid() and status='active') then
  raise exception 'Matching active membership required' using errcode='42501';
 end if;
 for v_command in select value from jsonb_array_elements(p_commands) loop
  v_results:=v_results||jsonb_build_array(private.apply_mobile_service_command(p_team_id,p_member_id,v_command));
 end loop;
 return v_results;
end;
$$;
revoke all on function public.mobile_apply_service_commands(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_service_commands(uuid,uuid,jsonb) to authenticated;
commit;
