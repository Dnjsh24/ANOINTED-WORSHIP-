-- Additive durable review wrapper. Existing review_join_request owns its side effects.
begin;
create table private.mobile_member_request_decision_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_member_request_decision_receipts enable row level security;
revoke all on private.mobile_member_request_decision_receipts from public,anon,authenticated;
create function private.guard_mobile_member_request_receipt() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Member request decision receipts are immutable' using errcode='42501';end;
$$;
revoke all on function private.guard_mobile_member_request_receipt() from public,anon,authenticated;
create trigger mobile_member_request_receipt_immutable before update or delete on private.mobile_member_request_decision_receipts for each row execute function private.guard_mobile_member_request_receipt();

create function private.mobile_member_request_current(p public.join_requests) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'teamId',p.team_id,'profileId',p.profile_id,'requestedRole',p.requested_role,'requestedAt',p.created_at,'status',p.status,'reviewedBy',p.reviewed_by,'reviewedAt',p.reviewed_at);
$$;
revoke all on function private.mobile_member_request_current(public.join_requests) from public,anon,authenticated;
create function private.has_mobile_join_review_permission(p_team uuid) returns boolean language sql stable security definer set search_path='' as $$
 -- Match canForTeam(join_requests.review), whose persisted override is members.manage.
 select private.is_approved_member(p_team) and coalesce(private.permission_override_value(p_team,'members.manage'),
   private.has_team_role(p_team,array['owner','admin']::public.team_role[]) or exists(select 1 from public.team_members m join public.custom_roles c on c.id=m.custom_role_id and c.team_id=m.team_id
    where m.team_id=p_team and m.profile_id=auth.uid() and m.status='active' and 'join_requests.review'=any(c.permissions)));
$$;
revoke all on function private.has_mobile_join_review_permission(uuid) from public,anon,authenticated;

create function public.mobile_apply_member_request_decision(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_id uuid;v_keys text[];v_key text;v_base jsonb;v_current jsonb;v_membership jsonb;v_reason text;v_status text;v_result jsonb;v_recorded timestamptz;
 v_actor_member public.team_members%rowtype;v_existing public.team_members%rowtype;v_member_before jsonb;v_row public.join_requests%rowtype;v_saved private.mobile_member_request_decision_receipts%rowtype;v_review text;
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected reviewer required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','requestId','base','decision'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version'<>'2'::jsonb
  or jsonb_typeof(p_request->'decision')<>'string' or p_request->>'decision' not in ('approved','rejected') then raise exception 'Invalid member request decision' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce','requestId'] loop
  if jsonb_typeof(p_request->v_key)<>'string' then raise exception 'Invalid decision identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Decision scope mismatch' using errcode='42501';end if;
 v_base:=p_request->'base';v_keys:=array['profileId','requestedRole','requestedAt','status'];
 if jsonb_typeof(v_base)<>'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb or v_base->'status'<>'"pending"'::jsonb
  or jsonb_typeof(v_base->'profileId')<>'string' or jsonb_typeof(v_base->'requestedRole')<>'string' or jsonb_typeof(v_base->'requestedAt')<>'string'
  or v_base->>'requestedAt'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}' then raise exception 'Invalid immutable pending base' using errcode='22023';end if;
 perform (v_base->>'profileId')::uuid;perform (v_base->>'requestedRole')::public.team_role;perform (v_base->>'requestedAt')::timestamptz;
 v_nonce:=(p_request->>'requestNonce')::uuid;v_id:=(p_request->>'requestId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('member-request-decision:'||v_actor::text,0));
 -- Shared membership locks serialize permission overrides and actor role changes.
 perform 1 from public.team_members where team_id=p_team_id order by id for share;
 select * into v_actor_member from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=v_actor and status='active';
 if not found then raise exception 'Current own review membership required' using errcode='42501';end if;
 if v_actor_member.custom_role_id is not null then perform 1 from public.custom_roles where id=v_actor_member.custom_role_id and team_id=p_team_id for share;end if;
 if not coalesce(private.has_team_permission(p_team_id,'members.manage'),false) or not coalesce(private.has_mobile_join_review_permission(p_team_id),false)
  or p_request->>'decision'='approved' and v_base->>'requestedRole'<>'member' and v_actor_member.role not in ('owner','admin') then raise exception 'Current review/member-management and role assignment authority required' using errcode='42501';end if;
 -- Current authorization and role-assignment rules apply before historical replay.
 select * into v_saved from private.mobile_member_request_decision_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Decision nonce belongs to another immutable intent' using errcode='22023';end if;
  return v_saved.result;
 end if;
 select * into v_row from public.join_requests where id=v_id for update;
 if found and v_row.team_id<>p_team_id then raise exception 'Join request belongs to another team' using errcode='42501';end if;
 if not found then v_status:='missing';
 else
  v_current:=private.mobile_member_request_current(v_row);
  if v_row.status<>'pending' or v_row.reviewed_by is not null or v_row.reviewed_at is not null or v_row.profile_id is distinct from (v_base->>'profileId')::uuid or v_row.requested_role is distinct from (v_base->>'requestedRole')::public.team_role or v_row.created_at is distinct from (v_base->>'requestedAt')::timestamptz then v_status:='conflict';
  elsif v_row.requested_role in ('owner','admin') then v_status:='blocked';v_reason:='privileged_request';
  else
   -- A profile FOR UPDATE lock fences new membership INSERT foreign-key checks
   -- across all callers, including the old website RPC. Concurrent uniqueness/FK
   -- deadlocks roll back and require exact retry; no unseen upsert may downgrade.
   perform 1 from public.profiles where id=v_row.profile_id for update;
   if not found then raise exception 'Requester profile is unavailable' using errcode='42501';end if;
   select * into v_existing from public.team_members where team_id=p_team_id and profile_id=v_row.profile_id for update;
   if p_request->>'decision'='approved' and found then
    v_status:='blocked';v_reason:='existing_membership';v_membership:=jsonb_build_object('id',v_existing.id,'teamId',v_existing.team_id,'profileId',v_existing.profile_id,'role',v_existing.role,'status',v_existing.status);
   else
    v_member_before:=case when found then to_jsonb(v_existing) else null end;
    v_review:=public.review_join_request(v_id,p_request->>'decision');
    select * into v_row from public.join_requests where id=v_id and team_id=p_team_id;
    if not found or v_review is distinct from p_request->>'decision' or v_row.status::text is distinct from p_request->>'decision' or v_row.reviewed_by is distinct from v_actor or v_row.reviewed_at is null
     or v_row.profile_id is distinct from (v_base->>'profileId')::uuid or v_row.requested_role is distinct from (v_base->>'requestedRole')::public.team_role or v_row.created_at is distinct from (v_base->>'requestedAt')::timestamptz then raise exception 'Join review did not persist the exact decision' using errcode='22023';end if;
    v_current:=private.mobile_member_request_current(v_row);
    select * into v_existing from public.team_members where team_id=p_team_id and profile_id=v_row.profile_id;
    if p_request->>'decision'='approved' then
     if not found or v_member_before is not null or v_existing.status<>'active' or v_existing.role<>v_row.requested_role then raise exception 'Approval membership was not newly created exactly' using errcode='22023';end if;
     v_membership:=jsonb_build_object('id',v_existing.id,'teamId',v_existing.team_id,'profileId',v_existing.profile_id,'role',v_existing.role,'status',v_existing.status);
    elsif (case when found then to_jsonb(v_existing) else null end) is distinct from v_member_before then raise exception 'Rejection changed membership' using errcode='22023';end if;
    v_status:='applied';
   end if;
  end if;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'membership',v_membership,'reason',v_reason,'recordedAt',v_recorded);
 insert into private.mobile_member_request_decision_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_member_request_decision(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_member_request_decision(uuid,uuid,jsonb) to authenticated;
commit;
