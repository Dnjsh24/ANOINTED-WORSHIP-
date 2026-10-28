-- Additive durable assignment of another non-owner member's role.
begin;
create table private.mobile_member_role_assignment_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_member_role_assignment_receipts enable row level security;
revoke all on private.mobile_member_role_assignment_receipts from public,anon,authenticated;
create trigger mobile_member_role_assignment_receipt_immutable before update or delete on private.mobile_member_role_assignment_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.mobile_member_role_snapshot(p_member public.team_members) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',p_member.id,'teamId',p_member.team_id,'profileId',p_member.profile_id,'role',p_member.role,'status',p_member.status,'customRoleId',p_member.custom_role_id,'createdAt',p_member.created_at);
$$;
revoke all on function private.mobile_member_role_snapshot(public.team_members) from public,anon,authenticated;
create function private.lock_mobile_member_role_actor(p_team_id uuid,p_member_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_actor public.team_members%rowtype;
begin
 if auth.uid() is null or p_team_id is null or p_member_id is null then raise exception 'Selected member manager required' using errcode='42501';end if;
 -- ponytail: one team-wide lock, consistent with guarded ownership/permission edits.
 -- Stable FOR UPDATE order avoids two managers upgrading shared membership locks.
 perform 1 from public.team_members where team_id=p_team_id order by id for update;
 select * into v_actor from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=auth.uid() and status='active';
 if not found or v_actor.role not in ('owner','admin') then raise exception 'Current own owner or admin membership required' using errcode='42501';end if;
 if v_actor.custom_role_id is not null then
  perform 1 from public.custom_roles where id=v_actor.custom_role_id and team_id=p_team_id for share;
  if not found then raise exception 'Current manager custom role unavailable' using errcode='42501';end if;
 end if;
 if not coalesce(private.has_team_permission(p_team_id,'members.manage'),false) then raise exception 'Current member-management permission required' using errcode='42501';end if;
end;
$$;
revoke all on function private.lock_mobile_member_role_actor(uuid,uuid) from public,anon,authenticated;
create function public.mobile_read_member_role_state(p_team_id uuid,p_member_id uuid,p_target_member_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_member public.team_members%rowtype;v_current jsonb;
begin
 if p_target_member_id is null then raise exception 'Target member required' using errcode='22023';end if;
 perform private.lock_mobile_member_role_actor(p_team_id,p_member_id);
 select * into v_member from public.team_members where id=p_target_member_id and team_id=p_team_id;
 if found then v_current:=private.mobile_member_role_snapshot(v_member);end if;
 return jsonb_build_object('version',2,'targetMemberId',p_target_member_id,'current',v_current,'fetchedAt',clock_timestamp());
end;
$$;
revoke all on function public.mobile_read_member_role_state(uuid,uuid,uuid) from public,anon;
grant execute on function public.mobile_read_member_role_state(uuid,uuid,uuid) to authenticated;
create function public.mobile_apply_member_role_assignment(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_keys text[];v_key text;v_base jsonb;v_value jsonb;v_custom jsonb;v_nonce uuid;
 v_base_created timestamptz;v_role_created timestamptz;v_custom_id uuid;v_base_custom_id uuid;
 v_member public.team_members%rowtype;v_role public.custom_roles%rowtype;v_before jsonb;
 v_saved private.mobile_member_role_assignment_receipts%rowtype;v_current jsonb;v_status text;v_reason text;v_result jsonb;v_recorded timestamptz;
 v_roles text[]:=array['owner','admin','pastor','worship_leader','band_leader','band_member','dancer','media','member'];
 v_known text[]:=array['team.manage','members.manage','join_requests.review','announcements.create','events.manage','events.review','events.request','songs.create','songs.edit','songs.review','songs.delete','setlists.manage','dance_notes.manage','dance_notes.review','files.upload','attendance.confirm','messages.send','prayer_requests.create'];
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected member manager required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','base','value'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid member role assignment' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid assignment identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Assignment scope mismatch' using errcode='42501';end if;
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
 v_value:=p_request->'value';v_keys:=array['role','customRole'];
 if jsonb_typeof(v_value) is distinct from 'object' or not v_value ?& v_keys or v_value-v_keys<>'{}'::jsonb or jsonb_typeof(v_value->'role') is distinct from 'string' or not (v_value->>'role')=any(v_roles) or v_value->>'role'='owner' then raise exception 'Choose a non-owner role' using errcode='22023';end if;
 v_custom:=v_value->'customRole';
 if v_custom<>'null'::jsonb then
  v_keys:=array['id','teamId','name','permissions','createdAt'];
  if jsonb_typeof(v_custom) is distinct from 'object' or not v_custom ?& v_keys or v_custom-v_keys<>'{}'::jsonb or v_value->>'role'<>'member' then raise exception 'Invalid selected custom role' using errcode='22023';end if;
  foreach v_key in array array['id','teamId'] loop
   if jsonb_typeof(v_custom->v_key) is distinct from 'string' then raise exception 'Invalid custom role scope' using errcode='22023';end if;perform (v_custom->>v_key)::uuid;
  end loop;
  v_custom_id:=(v_custom->>'id')::uuid;
  if v_custom->>'id'<>v_custom_id::text then raise exception 'Use canonical custom role IDs' using errcode='22023';end if;
  if (v_custom->>'teamId')::uuid is distinct from p_team_id then raise exception 'Custom role team mismatch' using errcode='42501';end if;
  if jsonb_typeof(v_custom->'name') is distinct from 'string' or length(v_custom->>'name')>160 or jsonb_typeof(v_custom->'permissions') is distinct from 'array' then raise exception 'Invalid custom role fingerprint' using errcode='22023';end if;
  if jsonb_array_length(v_custom->'permissions')>100 or exists(select 1 from jsonb_array_elements(v_custom->'permissions') p where jsonb_typeof(p)<>'string' or not (p#>>'{}')=any(v_known)) then raise exception 'Unsupported custom role permissions' using errcode='22023';end if;
  if v_custom->'createdAt'<>'null'::jsonb then
   if jsonb_typeof(v_custom->'createdAt') is distinct from 'string' or (v_custom->>'createdAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid custom role timestamp' using errcode='22023';end if;
   v_role_created:=(v_custom->>'createdAt')::timestamptz;
   if not isfinite(v_role_created) then raise exception 'Invalid custom role timestamp' using errcode='22023';end if;
  end if;
 end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('member-role-assignment:'||v_actor::text,0));
 perform private.lock_mobile_member_role_actor(p_team_id,p_member_id);
 -- Current authority is established before returning any historical receipt.
 select * into v_saved from private.mobile_member_role_assignment_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Assignment nonce belongs to another immutable intent' using errcode='22023';end if;return v_saved.result;
 end if;
 select * into v_member from public.team_members where id=(v_base->>'id')::uuid and team_id=p_team_id;
 if not found then v_status:='missing';
 else
  if v_member.role='owner' then raise exception 'Use the ownership transfer workflow for owners' using errcode='42501';end if;
  v_current:=private.mobile_member_role_snapshot(v_member);
  if v_member.profile_id is distinct from (v_base->>'profileId')::uuid or v_member.role::text is distinct from v_base->>'role' or v_member.status::text is distinct from v_base->>'status' or v_member.custom_role_id is distinct from v_base_custom_id or v_member.created_at is distinct from v_base_created then v_status:='conflict';
  else
   if v_custom_id is not null then
    select * into v_role from public.custom_roles where id=v_custom_id for share;
    if not found then v_status:='blocked';v_reason:='custom_role_missing';
    elsif v_role.team_id<>p_team_id then raise exception 'Custom role belongs to another team' using errcode='42501';
    elsif v_role.name is distinct from v_custom->>'name' or to_jsonb(v_role.permissions) is distinct from v_custom->'permissions' or v_role.created_at is distinct from v_role_created then v_status:='blocked';v_reason:='custom_role_changed';
    end if;
   end if;
   if v_status is null then
    v_before:=to_jsonb(v_member)-array['role','custom_role_id','updated_at'];
    update public.team_members set role=(v_value->>'role')::public.team_role,custom_role_id=v_custom_id where id=v_member.id and team_id=p_team_id returning * into v_member;
    if not found or v_member.role::text is distinct from v_value->>'role' or v_member.custom_role_id is distinct from v_custom_id or (to_jsonb(v_member)-array['role','custom_role_id','updated_at']) is distinct from v_before then raise exception 'Exact role assignment persistence could not be confirmed' using errcode='22023';end if;
    v_status:='applied';v_current:=v_base||jsonb_build_object('role',v_value->>'role','customRoleId',v_custom_id);
   else v_current:=v_base;
   end if;
  end if;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'reason',v_reason,'recordedAt',v_recorded);
 insert into private.mobile_member_role_assignment_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_member_role_assignment(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_member_role_assignment(uuid,uuid,jsonb) to authenticated;
commit;
