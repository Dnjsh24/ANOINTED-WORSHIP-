-- Atomic bounded batches reuse the existing authenticated single-decision RPC.
begin;
create table private.mobile_member_request_batch_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_member_request_batch_receipts enable row level security;
revoke all on private.mobile_member_request_batch_receipts from public,anon,authenticated;
create trigger mobile_member_request_batch_receipt_immutable before update or delete on private.mobile_member_request_batch_receipts for each row execute function private.guard_mobile_member_request_receipt();

create function public.mobile_apply_member_request_batch(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_keys text[];v_key text;v_child jsonb;v_previous text:='';v_nonces uuid[];v_targets uuid[]:='{}';v_id uuid;v_child_nonce uuid;
 v_actor_member public.team_members%rowtype;v_saved private.mobile_member_request_batch_receipts%rowtype;v_receipts jsonb:='[]';v_result jsonb;v_recorded timestamptz;
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected batch reviewer required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','decisions'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>262144 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version'<>'2'::jsonb
  or jsonb_typeof(p_request->'decisions')<>'array' then raise exception 'Invalid approval batch' using errcode='22023';end if;
 if jsonb_array_length(p_request->'decisions') not between 1 and 100 then raise exception 'Choose between 1 and 100 requests' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key)<>'string' then raise exception 'Invalid batch identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Batch scope mismatch' using errcode='42501';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;v_nonces:=array[v_nonce];
 for v_child in select value from jsonb_array_elements(p_request->'decisions') loop
  v_keys:=array['version','userId','teamId','memberId','requestNonce','requestId','base','decision'];
  if jsonb_typeof(v_child)<>'object' or not v_child ?& v_keys or v_child-v_keys<>'{}'::jsonb or v_child->'version'<>'2'::jsonb or v_child->'decision'<>'"approved"'::jsonb
   or jsonb_typeof(v_child->'requestId')<>'string' or jsonb_typeof(v_child->'requestNonce')<>'string' or jsonb_typeof(v_child->'base')<>'object'
   or v_child->'userId' is distinct from p_request->'userId' or v_child->'teamId' is distinct from p_request->'teamId' or v_child->'memberId' is distinct from p_request->'memberId' then raise exception 'Batch children require matching approval scope' using errcode='22023';end if;
  v_id:=(v_child->>'requestId')::uuid;v_child_nonce:=(v_child->>'requestNonce')::uuid;
  if v_id::text<>v_child->>'requestId' or v_child_nonce::text<>v_child->>'requestNonce' or v_child->>'requestId'<=v_previous or v_child_nonce=any(v_nonces) then raise exception 'Batch targets must be sorted and child nonces distinct' using errcode='22023';end if;
  v_previous:=v_child->>'requestId';v_nonces:=array_append(v_nonces,v_child_nonce);v_targets:=array_append(v_targets,v_id);
 end loop;
 -- Same lock namespace as single decisions, so single and bulk retries serialize.
 perform pg_advisory_xact_lock(hashtextextended('member-request-decision:'||v_actor::text,0));
 perform 1 from public.team_members where team_id=p_team_id order by id for share;
 select * into v_actor_member from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=v_actor and status='active';
 if not found then raise exception 'Current own batch review membership required' using errcode='42501';end if;
 if v_actor_member.custom_role_id is not null then perform 1 from public.custom_roles where id=v_actor_member.custom_role_id and team_id=p_team_id for share;end if;
 if not coalesce(private.has_team_permission(p_team_id,'members.manage'),false) or not coalesce(private.has_mobile_join_review_permission(p_team_id),false) then raise exception 'Current review and member-management authority required' using errcode='42501';end if;
 for v_child in select value from jsonb_array_elements(p_request->'decisions') loop
  if v_child#>>'{base,requestedRole}' is null or v_child#>>'{base,requestedRole}'<>'member' and v_actor_member.role not in ('owner','admin') then raise exception 'Current batch role-assignment authority required' using errcode='42501';end if;
 end loop;
 -- Never reveal a historical receipt after role or permission revocation.
 select * into v_saved from private.mobile_member_request_batch_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Batch nonce belongs to another immutable intent' using errcode='22023';end if;
  return v_saved.result;
 end if;
 if exists(select 1 from public.join_requests where id=any(v_targets) and team_id<>p_team_id) then raise exception 'Batch target belongs to another team' using errcode='42501';end if;
 perform 1 from public.join_requests where id=any(v_targets) order by id for update;
 perform 1 from public.profiles where id in(select profile_id from public.join_requests where id=any(v_targets) and team_id=p_team_id) order by id for update;
 for v_child in select value from jsonb_array_elements(p_request->'decisions') loop
  v_receipts:=v_receipts||jsonb_build_array(public.mobile_apply_member_request_decision(p_team_id,p_member_id,v_child));
 end loop;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'receipts',v_receipts,'recordedAt',v_recorded);
 insert into private.mobile_member_request_batch_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_member_request_batch(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_member_request_batch(uuid,uuid,jsonb) to authenticated;
commit;
