-- DRAFT: extend the existing rehearsal ledger with proposal submission only.
-- No new table/grant or hosted change. Website request nonce and review rules remain authoritative.
begin;
alter function private.validate_mobile_rehearsal_command(jsonb,uuid,uuid) rename to validate_mobile_rehearsal_command_core;
create function private.validate_mobile_rehearsal_command(p_command jsonb,p_team uuid,p_member uuid) returns void
language plpgsql set search_path='' as $$
begin
 if p_command->>'type'<>'rehearsal.plan.request' then perform private.validate_mobile_rehearsal_command_core(p_command,p_team,p_member); return; end if;
 if jsonb_typeof(p_command->'reason') is distinct from 'string' or length(trim(p_command->>'reason')) not between 1 and 1000
   or p_command->>'reason'<>trim(p_command->>'reason') then raise exception 'Give a bounded proposal reason' using errcode='22023'; end if;
 perform private.validate_mobile_rehearsal_command_core((p_command-'reason')||jsonb_build_object('type','rehearsal.plan.save'),p_team,p_member);
 perform private.validate_shared_edit_changes('rehearsal_plan',p_command->'value');
end;
$$;
revoke all on function private.validate_mobile_rehearsal_command(jsonb,uuid,uuid) from public,anon,authenticated;

alter function private.apply_mobile_rehearsal_command(uuid,uuid,jsonb) rename to apply_mobile_rehearsal_command_core;
create function private.apply_mobile_rehearsal_command(p_team uuid,p_member uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=(p_command->>'commandId')::uuid; v_setlist uuid:=(p_command->>'setlistId')::uuid;
 v_hash text:=encode(pg_catalog.sha256(pg_catalog.convert_to(p_command::text,'UTF8')),'hex'); v_common jsonb; v_result jsonb; v_snapshot jsonb; v_request public.shared_edit_requests%rowtype;
 v_receipt public.mobile_setlist_command_receipts%rowtype; v_dependency jsonb; v_request_id uuid;
begin
 if p_command->>'type'<>'rehearsal.plan.request' then return private.apply_mobile_rehearsal_command_core(p_team,p_member,p_command); end if;
 perform private.require_mobile_template_identity(p_team,p_member);
 v_common:=jsonb_build_object('commandId',v_id,'setlistId',v_setlist,'type','rehearsal.plan.request','payloadHash',v_hash);
 v_snapshot:=private.mobile_rehearsal_snapshot(p_team,p_member,v_setlist);
 select * into v_receipt from public.mobile_setlist_command_receipts where actor_id=auth.uid() and team_id=p_team and command_id=v_id;
 if found then
  if v_receipt.member_id<>p_member or v_receipt.command is distinct from p_command or v_receipt.payload_hash<>v_hash then
   return v_common||jsonb_build_object('status','rejected','code','command_id_conflict','message','This command ID belongs to another saved intent.');
  end if;
  if v_receipt.result ? 'workspace' and (v_receipt.result#>'{workspace,eventId}' is distinct from v_snapshot->'eventId'
    or exists(select 1 from jsonb_array_elements(v_receipt.result#>'{workspace,slots}') old_slot where not exists(
      select 1 from jsonb_array_elements(v_snapshot->'slots') current_slot where old_slot->>'id'=current_slot->>'id' and old_slot->>'songId'=current_slot->>'songId'))) then
   raise exception 'Historical rehearsal parent is no longer visible' using errcode='42501';
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
   if v_snapshot-array['plan','checks','readiness','members','assignedMemberIds'] is distinct from p_command->'baseParent' then
    raise exception 'Rehearsal parent changed' using errcode='40001';
   end if;
   -- The existing RPC derives actor/team, owns nonce idempotency and preserves stale revisions as needs_revision.
   v_request_id:=public.submit_shared_edit_request('rehearsal_plan',v_setlist,coalesce((p_command#>>'{baseValue,revision}')::bigint,0),
     p_command->'value',p_command->>'reason',v_id);
   select * into v_request from public.shared_edit_requests where id=v_request_id and team_id=p_team and requested_by=auth.uid()
     and request_nonce=v_id and target_type='rehearsal_plan' and target_id=v_setlist;
   if not found then raise exception 'Matching proposal confirmation required' using errcode='42501'; end if;
   v_result:=v_common||jsonb_build_object('status','applied','workspace',v_snapshot,'request',to_jsonb(v_request));
  exception when sqlstate '40001' then v_result:=v_common||jsonb_build_object('status','conflict','workspace',v_snapshot,'original',p_command);
  when sqlstate '42501' then v_result:=v_common||jsonb_build_object('status','rejected','code','permission','message','Current rehearsal access is required. Your proposal is retained.');
  when sqlstate '22023' or sqlstate '22P02' or sqlstate '23514' then v_result:=v_common||jsonb_build_object('status','rejected','code','invalid','message','Review the proposal fields and keep the same identifier only for an exact retry.');
  end;
 end if;
 insert into public.mobile_setlist_command_receipts(actor_id,team_id,member_id,command_id,setlist_id,command,payload_hash,result)
   values(auth.uid(),p_team,p_member,v_id,v_setlist,p_command,v_hash,v_result);
 return v_result;
end;
$$;
revoke all on function private.apply_mobile_rehearsal_command(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function private.validate_mobile_rehearsal_command_core(jsonb,uuid,uuid),private.apply_mobile_rehearsal_command_core(uuid,uuid,jsonb) from public,anon,authenticated;
commit;
