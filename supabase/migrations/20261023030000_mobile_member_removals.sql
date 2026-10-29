-- Additive durable removal of another non-owner team membership.
begin;
create table private.mobile_member_removal_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_member_removal_receipts enable row level security;
revoke all on private.mobile_member_removal_receipts from public,anon,authenticated;
create trigger mobile_member_removal_receipt_immutable before update or delete on private.mobile_member_removal_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function public.mobile_apply_member_removal(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_keys text[];v_key text;v_base jsonb;v_nonce uuid;
 v_base_created timestamptz;v_base_custom_id uuid;
 v_member public.team_members%rowtype;
 v_saved private.mobile_member_removal_receipts%rowtype;v_current jsonb;v_status text;v_reason text;v_result jsonb;v_recorded timestamptz;
 v_roles text[]:=array['owner','admin','pastor','worship_leader','band_leader','band_member','dancer','media','member'];

begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected member manager required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','base'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid member removal' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid removal identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Removal scope mismatch' using errcode='42501';end if;
 v_base:=p_request->'base';v_keys:=array['id','teamId','profileId','role','status','customRoleId','createdAt'];
 if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb then raise exception 'Invalid exact member base' using errcode='22023';end if;
 foreach v_key in array array['id','teamId','profileId'] loop
  if jsonb_typeof(v_base->v_key) is distinct from 'string' then raise exception 'Invalid member identity' using errcode='22023';end if;perform (v_base->>v_key)::uuid;
 end loop;
 if (v_base->>'teamId')::uuid is distinct from p_team_id then raise exception 'Member base team mismatch' using errcode='42501';end if;
 if jsonb_typeof(v_base->'role') is distinct from 'string' or not (v_base->>'role')=any(v_roles) or jsonb_typeof(v_base->'status') is distinct from 'string' or v_base->>'status' not in ('active','inactive') then raise exception 'Invalid saved member role or status' using errcode='22023';end if;
 if (v_base->>'id')::uuid=p_member_id or (v_base->>'profileId')::uuid=v_actor or v_base->>'role'='owner' then raise exception 'Use another non-owner member' using errcode='42501';end if;
 if v_base->'customRoleId'<>'null'::jsonb then
  if jsonb_typeof(v_base->'customRoleId') is distinct from 'string' then raise exception 'Invalid base custom role ID' using errcode='22023';end if;
  v_base_custom_id:=(v_base->>'customRoleId')::uuid;
 end if;
 if jsonb_typeof(v_base->'createdAt') is distinct from 'string' or (v_base->>'createdAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid member timestamp' using errcode='22023';end if;
 v_base_created:=(v_base->>'createdAt')::timestamptz;
 if not isfinite(v_base_created) then raise exception 'Invalid member timestamp' using errcode='22023';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('member-removal:'||v_actor::text,0));
 perform private.lock_mobile_member_role_actor(p_team_id,p_member_id);
 -- Current authority is established before returning any historical receipt.
 select * into v_saved from private.mobile_member_removal_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Removal nonce belongs to another immutable intent' using errcode='22023';end if;return v_saved.result;
 end if;
 select * into v_member from public.team_members where id=(v_base->>'id')::uuid and team_id=p_team_id;
 if not found then v_status:='missing';
 else
  if v_member.role='owner' then raise exception 'Use the ownership transfer workflow for owners' using errcode='42501';end if;
  v_current:=private.mobile_member_role_snapshot(v_member);
  if v_member.profile_id is distinct from (v_base->>'profileId')::uuid or v_member.role::text is distinct from v_base->>'role' or v_member.status::text is distinct from v_base->>'status' or v_member.custom_role_id is distinct from v_base_custom_id or v_member.created_at is distinct from v_base_created then v_status:='conflict';
  else
   -- Keep all existing foreign-key cascades, SET NULL actions and restrictions.
   -- A later ledger failure rolls back this deletion and every cascading change.
   begin
    delete from public.team_members where id=v_member.id and team_id=p_team_id;
    if not found then raise exception 'Exact member removal could not be confirmed' using errcode='22023';end if;
    v_status:='applied';v_current:=null;
   exception when foreign_key_violation or restrict_violation then
    -- The subtransaction restores every cascading action before saving this outcome.
    v_status:='blocked';v_reason:='related_records';v_current:=v_base;
   end;
  end if;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'reason',v_reason,'recordedAt',v_recorded);
 insert into private.mobile_member_removal_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_member_removal(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_member_removal(uuid,uuid,jsonb) to authenticated;
commit;
