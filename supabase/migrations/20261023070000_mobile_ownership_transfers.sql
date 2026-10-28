-- Ownership transfer receipts support narrowly bound recovery after actor demotion.
begin;
create table private.mobile_ownership_transfer_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_ownership_transfer_receipts enable row level security;
revoke all on private.mobile_ownership_transfer_receipts from public,anon,authenticated;
create trigger mobile_ownership_transfer_receipt_immutable before update or delete on private.mobile_ownership_transfer_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.mobile_ownership_current(p_team uuid,p_actor uuid,p_target uuid) returns jsonb language sql volatile set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('ownerId',t.owner_id,'actor',(select private.mobile_member_role_snapshot(m) from public.team_members m where m.id=p_actor and m.team_id=p_team),
 'target',(select private.mobile_member_role_snapshot(m) from public.team_members m where m.id=p_target and m.team_id=p_team)) from public.teams t where t.id=p_team;
$$;
revoke all on function private.mobile_ownership_current(uuid,uuid,uuid) from public,anon,authenticated;
create function private.normalize_mobile_ownership_current(p_value jsonb) returns jsonb language plpgsql stable set search_path='' set timezone='UTC' as $$
begin
 p_value:=jsonb_set(p_value,'{actor,createdAt}',to_jsonb((p_value#>>'{actor,createdAt}')::timestamptz));
 if p_value->'target'<>'null'::jsonb then p_value:=jsonb_set(p_value,'{target,createdAt}',to_jsonb((p_value#>>'{target,createdAt}')::timestamptz));end if;
 return p_value;
end;
$$;
revoke all on function private.normalize_mobile_ownership_current(jsonb) from public,anon,authenticated;
create function private.lock_mobile_ownership_actor(p_team uuid,p_member uuid) returns public.team_members language plpgsql security definer set search_path='' as $$
declare v_member public.team_members%rowtype;
begin
 if auth.uid() is null or p_team is null or p_member is null then raise exception 'Selected ownership actor required' using errcode='42501';end if;
 perform 1 from public.team_members where team_id=p_team order by id for update;
 perform 1 from public.teams where id=p_team for update;
 select * into v_member from public.team_members where id=p_member and team_id=p_team and profile_id=auth.uid() and status='active';
 if not found then raise exception 'The original active actor membership is required' using errcode='42501';end if;
 return v_member;
end;
$$;
revoke all on function private.lock_mobile_ownership_actor(uuid,uuid) from public,anon,authenticated;
create function private.require_mobile_ownership_writer(p_team uuid,p_actor public.team_members) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_actor.role<>'owner' or not exists(select 1 from public.teams where id=p_team and owner_id=p_actor.profile_id) or not coalesce(private.has_team_permission(p_team,'team.manage'),false) then raise exception 'Current canonical owner and team-management authority required' using errcode='42501';end if;
end;
$$;
revoke all on function private.require_mobile_ownership_writer(uuid,public.team_members) from public,anon,authenticated;
create function public.mobile_read_ownership_transfer_state(p_team_id uuid,p_member_id uuid,p_target_member_id uuid,p_request_nonce uuid default null) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor public.team_members%rowtype;v_saved private.mobile_ownership_transfer_receipts%rowtype;v_current jsonb;
begin
 if p_target_member_id is null or p_target_member_id=p_member_id then raise exception 'Choose another target membership' using errcode='22023';end if;
 v_actor:=private.lock_mobile_ownership_actor(p_team_id,p_member_id);
 v_current:=private.mobile_ownership_current(p_team_id,p_member_id,p_target_member_id);
 if p_request_nonce is not null then
  select * into v_saved from private.mobile_ownership_transfer_receipts where actor_id=auth.uid() and request_nonce=p_request_nonce;
  if not found or v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or (v_saved.request#>>'{base,target,id}')::uuid<>p_target_member_id or v_saved.result->>'status'<>'applied'
    or private.normalize_mobile_ownership_current(v_current) is distinct from private.normalize_mobile_ownership_current(v_saved.result->'current') then raise exception 'The exact applied ownership recovery is no longer current' using errcode='42501';end if;
  -- Return the exact timestamp spelling from the sealed receipt after proving the
  -- real PostgreSQL timestamps, membership incarnations and ownership still match.
  v_current:=v_saved.result->'current';
 else perform private.require_mobile_ownership_writer(p_team_id,v_actor);
 end if;
 return jsonb_build_object('version',2,'targetMemberId',p_target_member_id,'requestNonce',p_request_nonce,'current',v_current,'fetchedAt',clock_timestamp());
end;
$$;
revoke all on function public.mobile_read_ownership_transfer_state(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.mobile_read_ownership_transfer_state(uuid,uuid,uuid,uuid) to authenticated;
create function public.mobile_apply_ownership_transfer(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor_id uuid:=auth.uid();v_keys text[];v_key text;v_base jsonb;v_item jsonb;v_side text;v_nonce uuid;v_target_id uuid;
 v_actor public.team_members%rowtype;v_target public.team_members%rowtype;v_saved private.mobile_ownership_transfer_receipts%rowtype;
 v_current jsonb;v_expected jsonb;v_status text;v_result jsonb;v_recorded timestamptz;v_time timestamptz;v_actor_before jsonb;v_target_before jsonb;v_team_before jsonb;
begin
 if v_actor_id is null or p_team_id is null or p_member_id is null then raise exception 'Selected ownership actor required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','base'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid ownership transfer request' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid ownership identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor_id or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Ownership scope mismatch' using errcode='42501';end if;
 v_base:=p_request->'base';v_keys:=array['ownerId','actor','target'];
 if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb or jsonb_typeof(v_base->'ownerId') is distinct from 'string' then raise exception 'Invalid ownership base' using errcode='22023';end if;
 if (v_base->>'ownerId')::uuid is distinct from v_actor_id then raise exception 'Original canonical owner mismatch' using errcode='42501';end if;
 foreach v_side in array array['actor','target'] loop
  v_item:=v_base->v_side;v_keys:=array['id','teamId','profileId','role','status','customRoleId','createdAt'];
  if jsonb_typeof(v_item) is distinct from 'object' or not v_item ?& v_keys or v_item-v_keys<>'{}'::jsonb then raise exception 'Invalid exact ownership membership' using errcode='22023';end if;
  foreach v_key in array array['id','teamId','profileId'] loop
   if jsonb_typeof(v_item->v_key) is distinct from 'string' then raise exception 'Invalid ownership member identity' using errcode='22023';end if;perform (v_item->>v_key)::uuid;
  end loop;
  if (v_item->>'teamId')::uuid is distinct from p_team_id then raise exception 'Ownership member team mismatch' using errcode='42501';end if;
  if jsonb_typeof(v_item->'role') is distinct from 'string' or v_item->>'role' not in ('owner','admin','pastor','worship_leader','band_leader','band_member','dancer','media','member') or v_item->>'status' is distinct from 'active' then raise exception 'Choose active ownership memberships' using errcode='22023';end if;
  if v_item->'customRoleId'<>'null'::jsonb then
   if jsonb_typeof(v_item->'customRoleId') is distinct from 'string' then raise exception 'Invalid ownership custom role' using errcode='22023';end if;perform (v_item->>'customRoleId')::uuid;
  end if;
  if jsonb_typeof(v_item->'createdAt') is distinct from 'string' or (v_item->>'createdAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid ownership timestamp' using errcode='22023';end if;
  v_time:=(v_item->>'createdAt')::timestamptz;if not isfinite(v_time) then raise exception 'Invalid ownership timestamp' using errcode='22023';end if;
 end loop;
 if (v_base#>>'{actor,id}')::uuid is distinct from p_member_id or (v_base#>>'{actor,profileId}')::uuid is distinct from v_actor_id or v_base#>>'{actor,role}'<>'owner' then raise exception 'Original owner membership mismatch' using errcode='42501';end if;
 v_target_id:=(v_base#>>'{target,id}')::uuid;
 if v_target_id=p_member_id or (v_base#>>'{target,profileId}')::uuid=v_actor_id or v_base#>>'{target,role}'='owner' then raise exception 'Choose another active non-owner target' using errcode='22023';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('ownership-transfer:'||v_actor_id::text,0));
 v_actor:=private.lock_mobile_ownership_actor(p_team_id,p_member_id);
 -- Before reading the ledger require the same active actor incarnation. A
 -- replacement with a reused membership UUID cannot recover another incarnation.
 if v_actor.created_at is distinct from (v_base#>>'{actor,createdAt}')::timestamptz then raise exception 'Original actor membership incarnation changed' using errcode='42501';end if;
 v_current:=private.mobile_ownership_current(p_team_id,p_member_id,v_target_id);
 select * into v_saved from private.mobile_ownership_transfer_receipts where actor_id=v_actor_id and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Ownership nonce belongs to another immutable intent' using errcode='22023';end if;
  if v_saved.result->>'status'='applied' then
   if private.normalize_mobile_ownership_current(v_current) is distinct from private.normalize_mobile_ownership_current(v_saved.result->'current') then raise exception 'Recorded ownership recovery is no longer current' using errcode='42501';end if;
  else perform private.require_mobile_ownership_writer(p_team_id,v_actor);
  end if;
  return v_saved.result;
 end if;
 perform private.require_mobile_ownership_writer(p_team_id,v_actor);
 if private.normalize_mobile_ownership_current(jsonb_build_object('ownerId',v_base->'ownerId','actor',v_current->'actor','target',v_base->'target')) is distinct from private.normalize_mobile_ownership_current(v_base) then raise exception 'Original owner membership changed before transfer' using errcode='42501';end if;
 select * into v_target from public.team_members where id=v_target_id and team_id=p_team_id;
 if not found then v_status:='missing';v_current:=jsonb_build_object('ownerId',v_base->'ownerId','actor',v_base->'actor','target',null);
 elsif private.normalize_mobile_ownership_current(v_current) is distinct from private.normalize_mobile_ownership_current(v_base) then v_status:='conflict';v_current:=jsonb_set(v_current,'{actor}',v_base->'actor');
 else
  v_actor_before:=to_jsonb(v_actor)-array['role','custom_role_id','updated_at'];v_target_before:=to_jsonb(v_target)-array['role','custom_role_id','updated_at'];
  select to_jsonb(t)-array['owner_id','updated_at'] into v_team_before from public.teams t where id=p_team_id;
  perform public.transfer_team_ownership(p_team_id,v_target_id);
  v_expected:=jsonb_build_object('ownerId',v_base#>'{target,profileId}','actor',(v_base->'actor')||jsonb_build_object('role','admin','customRoleId',null),'target',(v_base->'target')||jsonb_build_object('role','owner','customRoleId',null));
  v_current:=private.mobile_ownership_current(p_team_id,p_member_id,v_target_id);
  if private.normalize_mobile_ownership_current(v_current) is distinct from private.normalize_mobile_ownership_current(v_expected) then raise exception 'Exact ownership transition not confirmed' using errcode='22023';end if;
  select * into v_actor from public.team_members where id=p_member_id;select * into v_target from public.team_members where id=v_target_id;
  if (to_jsonb(v_actor)-array['role','custom_role_id','updated_at']) is distinct from v_actor_before or (to_jsonb(v_target)-array['role','custom_role_id','updated_at']) is distinct from v_target_before or v_team_before is distinct from (select to_jsonb(t)-array['owner_id','updated_at'] from public.teams t where id=p_team_id) then raise exception 'Ownership transfer changed unrelated fields' using errcode='22023';end if;
  v_status:='applied';v_current:=v_expected;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'recordedAt',v_recorded);
 insert into private.mobile_ownership_transfer_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor_id,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_ownership_transfer(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_ownership_transfer(uuid,uuid,jsonb) to authenticated;
commit;
