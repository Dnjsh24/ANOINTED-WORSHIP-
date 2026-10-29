-- Self-departure history survives the membership it confirms. No client can read
-- this ledger directly; the authenticated recovery functions disclose only its
-- caller's exact receipt or a minimal absence proof.
begin;
create table private.mobile_self_member_leave_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_self_member_leave_receipts enable row level security;
revoke all on private.mobile_self_member_leave_receipts from public,anon,authenticated;
create trigger mobile_self_member_leave_receipt_immutable before update or delete on private.mobile_self_member_leave_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.lock_mobile_self_member_leave(p_team uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_team is null then raise exception 'Authenticated departure account required' using errcode='42501';end if;
 -- Same order as membership/ownership mutations; the team lock also serializes
 -- membership inserts through their team foreign key before absence is checked.
 perform 1 from public.team_members where team_id=p_team order by id for update;
 perform 1 from public.teams where id=p_team for update;
end;
$$;
revoke all on function private.lock_mobile_self_member_leave(uuid) from public,anon,authenticated;
create function private.mobile_self_member_leave_current(p_team uuid,p_member uuid) returns jsonb language sql volatile set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('ownerId',t.owner_id,'member',private.mobile_member_role_snapshot(m)) from public.team_members m join public.teams t on t.id=m.team_id
 where m.id=p_member and m.team_id=p_team and m.profile_id=auth.uid() and m.status='active';
$$;
revoke all on function private.mobile_self_member_leave_current(uuid,uuid) from public,anon,authenticated;
create function private.normalize_mobile_self_member_leave(p_base jsonb) returns jsonb language sql stable set search_path='' set timezone='UTC' as $$
 select jsonb_set(p_base,'{member,createdAt}',to_jsonb((p_base#>>'{member,createdAt}')::timestamptz));
$$;
revoke all on function private.normalize_mobile_self_member_leave(jsonb) from public,anon,authenticated;
create function private.require_mobile_self_member_leave_absent(p_team uuid,p_member uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.team_members where id=p_member or (team_id=p_team and profile_id=auth.uid()))
 or exists(select 1 from public.teams where id=p_team and owner_id=auth.uid()) then raise exception 'Recorded departure no longer matches this account membership' using errcode='42501';end if;
end;
$$;
revoke all on function private.require_mobile_self_member_leave_absent(uuid,uuid) from public,anon,authenticated;
create function public.mobile_read_self_member_leave_state(p_team_id uuid,p_member_id uuid,p_request_nonce uuid default null) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_saved private.mobile_self_member_leave_receipts%rowtype;v_current jsonb;
begin
 if p_member_id is null then raise exception 'Original departure membership required' using errcode='42501';end if;
 perform private.lock_mobile_self_member_leave(p_team_id);
 if p_request_nonce is not null then
  select * into v_saved from private.mobile_self_member_leave_receipts where actor_id=auth.uid() and request_nonce=p_request_nonce;
  if not found or v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.result->>'status'<>'applied' then raise exception 'Exact recorded departure required' using errcode='42501';end if;
  perform private.require_mobile_self_member_leave_absent(p_team_id,p_member_id);v_current:=null;
 else
  v_current:=private.mobile_self_member_leave_current(p_team_id,p_member_id);
  if v_current is null then raise exception 'Own active membership required' using errcode='42501';end if;
 end if;
 return jsonb_build_object('version',2,'userId',auth.uid(),'teamId',p_team_id,'memberId',p_member_id,'requestNonce',p_request_nonce,'current',v_current,'fetchedAt',clock_timestamp());
end;
$$;
revoke all on function public.mobile_read_self_member_leave_state(uuid,uuid,uuid) from public,anon;
grant execute on function public.mobile_read_self_member_leave_state(uuid,uuid,uuid) to authenticated;
create function public.mobile_apply_self_member_leave(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_keys text[];v_key text;v_base jsonb;v_member jsonb;v_current jsonb;
 v_saved private.mobile_self_member_leave_receipts%rowtype;v_status text;v_reason text;v_result jsonb;v_recorded timestamptz;v_time timestamptz;
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Authenticated departure account required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','confirmation','base'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb
 or p_request->'version' is distinct from '2'::jsonb or p_request->'confirmation' is distinct from '"LEAVE TEAM"'::jsonb then raise exception 'Exact departure confirmation required' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid departure identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Departure scope mismatch' using errcode='42501';end if;
 v_base:=p_request->'base';v_keys:=array['ownerId','member'];
 if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb or jsonb_typeof(v_base->'ownerId') is distinct from 'string' then raise exception 'Invalid departure base' using errcode='22023';end if;
 perform (v_base->>'ownerId')::uuid;
 v_member:=v_base->'member';v_keys:=array['id','teamId','profileId','role','status','customRoleId','createdAt'];
 if jsonb_typeof(v_member) is distinct from 'object' or not v_member ?& v_keys or v_member-v_keys<>'{}'::jsonb then raise exception 'Invalid exact departure membership' using errcode='22023';end if;
 foreach v_key in array array['id','teamId','profileId'] loop
  if jsonb_typeof(v_member->v_key) is distinct from 'string' then raise exception 'Invalid departure member identity' using errcode='22023';end if;perform (v_member->>v_key)::uuid;
 end loop;
 if (v_member->>'id')::uuid is distinct from p_member_id or (v_member->>'teamId')::uuid is distinct from p_team_id or (v_member->>'profileId')::uuid is distinct from v_actor then raise exception 'Own departure membership required' using errcode='42501';end if;
 if jsonb_typeof(v_member->'role') is distinct from 'string' or v_member->>'role' not in ('admin','pastor','worship_leader','band_leader','band_member','dancer','media','member') or v_member->>'status' is distinct from 'active' or (v_base->>'ownerId')::uuid=v_actor then raise exception 'Owners must transfer ownership before leaving' using errcode='42501';end if;
 if v_member->'customRoleId'<>'null'::jsonb then
  if jsonb_typeof(v_member->'customRoleId') is distinct from 'string' then raise exception 'Invalid departure custom role' using errcode='22023';end if;perform (v_member->>'customRoleId')::uuid;
 end if;
 if jsonb_typeof(v_member->'createdAt') is distinct from 'string' or v_member->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid departure timestamp' using errcode='22023';end if;
 v_time:=(v_member->>'createdAt')::timestamptz;if not isfinite(v_time) then raise exception 'Invalid departure timestamp' using errcode='22023';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('self-member-leave:'||v_actor::text,0));
 perform private.lock_mobile_self_member_leave(p_team_id);
 select * into v_saved from private.mobile_self_member_leave_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found and (v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request) then raise exception 'Departure nonce belongs to another immutable intent' using errcode='22023';end if;
 if found and v_saved.result->>'status'='applied' then
  perform private.require_mobile_self_member_leave_absent(p_team_id,p_member_id);return v_saved.result;
 end if;
 v_current:=private.mobile_self_member_leave_current(p_team_id,p_member_id);
 if v_current is null or (v_current#>>'{member,createdAt}')::timestamptz is distinct from v_time then raise exception 'Original active membership incarnation required' using errcode='42501';end if;
 if v_saved.actor_id is not null then return v_saved.result;end if;
 if private.normalize_mobile_self_member_leave(v_current) is distinct from private.normalize_mobile_self_member_leave(v_base) then v_status:='conflict';
 else
  -- A canonical owner cannot leave even if a corrupt legacy role says member.
  if v_current->>'ownerId'=v_actor::text or v_current#>>'{member,role}'='owner' then raise exception 'Owner cannot leave' using errcode='42501';end if;
  begin
   perform public.leave_team_workspace(p_team_id);v_status:='applied';v_current:=null;
  exception when restrict_violation or foreign_key_violation then
   -- The subtransaction restores every cascade/set-null effect of DELETE.
   v_status:='blocked';v_reason:='related_records';v_current:=v_base;
  end;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'reason',v_reason,'recordedAt',v_recorded);
 insert into private.mobile_self_member_leave_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_self_member_leave(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_self_member_leave(uuid,uuid,jsonb) to authenticated;
commit;
