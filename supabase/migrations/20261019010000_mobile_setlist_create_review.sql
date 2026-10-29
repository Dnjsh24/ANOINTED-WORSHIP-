-- DRAFT: apply only through an explicitly authorized backend release.
-- Additive read-only review. Existing immutable commands and receipts are never replayed or changed.
begin;

create function public.mobile_read_setlist_create_review(p_team_id uuid,p_member_id uuid,p_request_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_id uuid; v_target uuid; v_hash text;
 v_receipt public.mobile_setlist_command_receipts%rowtype; v_dependency jsonb;
begin
 -- Preserve the existing membership-lock order and recheck current permission before inspecting any evidence.
 perform private.require_mobile_setlist_member(p_team_id,p_member_id);
 if p_request_id is null or p_command is null or octet_length(p_command::text)>1048576 then
  raise exception 'Invalid new-setlist review' using errcode='22023';
 end if;
 perform private.validate_mobile_setlist_command(p_command,p_team_id);
 if p_command->>'type'<>'setlist.save' or p_command->>'mode'<>'create' then
  raise exception 'Original new-setlist command required' using errcode='22023';
 end if;
 v_id:=(p_command->>'commandId')::uuid; v_target:=(p_command->>'setlistId')::uuid;
 v_hash:=encode(pg_catalog.sha256(pg_catalog.convert_to(p_command::text,'UTF8')),'hex');
 select * into v_receipt from public.mobile_setlist_command_receipts
  where actor_id=v_actor and team_id=p_team_id and command_id=v_id;
 if not found or v_receipt.member_id is distinct from p_member_id or v_receipt.setlist_id is distinct from v_target
  or v_receipt.payload_hash is distinct from v_hash or v_receipt.command is distinct from p_command
  or v_receipt.result->>'commandId' is distinct from v_id::text or v_receipt.result->>'setlistId' is distinct from v_target::text
  or v_receipt.result->>'type' is distinct from 'setlist.save' or v_receipt.result->>'payloadHash' is distinct from v_hash
  or not coalesce((v_receipt.result->>'status'='conflict' and v_receipt.result#>'{remote,snapshot}'='null'::jsonb) or v_receipt.result->>'status'='blocked'
   or (v_receipt.result->>'status'='rejected' and v_receipt.result->>'code' in ('permission','unavailable')),false) then
  raise exception 'New-setlist review unavailable' using errcode='P0002';
 end if;
 for v_dependency in select value from jsonb_array_elements(p_command->'dependsOn') loop
  if not exists(select 1 from public.mobile_setlist_command_receipts
    where actor_id=v_actor and team_id=p_team_id and member_id=p_member_id and command_id=(v_dependency#>>'{}')::uuid and result->>'status'='applied')
   and not exists(select 1 from public.mobile_workflow_command_receipts r
    where actor_id=v_actor and team_id=p_team_id and member_id=p_member_id and command_id=(v_dependency#>>'{}')::uuid and result->>'status'='applied'
     and not exists(select 1 from public.mobile_command_receipts where actor_id=v_actor and team_id=p_team_id and command_id=r.command_id)) then
   raise exception 'New-setlist review unavailable' using errcode='P0002';
  end if;
 end loop;
 -- Absence is global, including hidden, soft-deleted and hard-deleted targets. No foreign content is returned.
 -- Retained bases/downloads and other commands are evidence too; an ambiguous target always fails closed.
 if exists(select 1 from public.setlists where id=v_target)
  or exists(select 1 from public.mobile_deleted_records where entity_type='setlist' and entity_id=v_target)
  or exists(select 1 from public.mobile_record_bases where entity_type='setlist' and entity_id=v_target)
  or exists(select 1 from public.mobile_download_records where entity_type='setlist' and entity_id=v_target)
  or exists(select 1 from public.mobile_setlist_command_receipts
   where not(actor_id=v_actor and team_id=p_team_id and command_id=v_id)
    and (setlist_id=v_target
     or jsonb_path_exists(command,
      '$ ? (@.setlistId == $target || @.baseValue.record.id == $target || exists(@.cascade.unlinkSetlists[*] ? (@.id == $target)))',
      jsonb_build_object('target',v_target::text))
     or jsonb_path_exists(result,
      '$ ? (@.setlistId == $target || @.baseValue.record.id == $target || @.remote.snapshot.record.id == $target
       || @.remote.deleteReview.snapshot.record.id == $target || @.outcome.snapshot.record.id == $target || @.outcome.setlist.id == $target
       || exists(@.localValue.cascade.unlinkSetlists[*] ? (@.id == $target))
       || exists(@.remote.deleteReview.cascade.unlinkSetlists[*] ? (@.id == $target))
       || exists(@.remote.deleteReview.siblings[*] ? (@.record.id == $target))
       || exists(@.outcome.unlinkedSetlists[*] ? (@.record.id == $target)))',
      jsonb_build_object('target',v_target::text))))
  or exists(select 1 from public.mobile_workflow_command_receipts
   where (actor_id=v_actor and team_id=p_team_id and command_id=v_id)
    or jsonb_path_exists(jsonb_build_array(command,result),
     '$.** ? (@.setlistId == $target || @.setlist_id == $target || @.linkedSetlistId == $target || @.linkedSetlistBase.id == $target || exists(@.linkedSetlists[*] ? (@.id == $target)) || (@.entityType == "setlist" && (@.entityId == $target || @.id == $target)))',
     jsonb_build_object('target',v_target::text)))
  or exists(select 1 from public.mobile_command_receipts
   where (actor_id=v_actor and team_id=p_team_id and command_id=v_id)
    or jsonb_path_exists(jsonb_build_array(command,result),
     '$.** ? (@.setlistId == $target || @.setlist_id == $target || @.linkedSetlistId == $target || @.linkedSetlistBase.id == $target || exists(@.linkedSetlists[*] ? (@.id == $target)) || (@.entityType == "setlist" && (@.entityId == $target || @.id == $target)))',
     jsonb_build_object('target',v_target::text))) then
  raise exception 'New-setlist review unavailable' using errcode='P0002';
 end if;
 perform private.assert_mobile_setlist_result_visibility(p_team_id,v_receipt.result);
 -- This is a point-in-time observation, not a reservation. The caller must obtain new consent for a new local draft.
 return jsonb_build_object('version',2,'requestId',p_request_id,
  'identity',jsonb_build_object('userId',v_actor,'teamId',p_team_id,'memberId',p_member_id),
  'receipt',v_receipt.result,'targetAbsent',true,'checkedAt',clock_timestamp());
end;
$$;
revoke all on function public.mobile_read_setlist_create_review(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_read_setlist_create_review(uuid,uuid,uuid,jsonb) to authenticated;

commit;
