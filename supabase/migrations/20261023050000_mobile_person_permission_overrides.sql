-- Durable person overrides bound to the exact active membership and selected row.
begin;
create table private.mobile_person_permission_override_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_person_permission_override_receipts enable row level security;
revoke all on private.mobile_person_permission_override_receipts from public,anon,authenticated;
create trigger mobile_person_permission_override_receipt_immutable before update or delete on private.mobile_person_permission_override_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.mobile_person_permission_row(p_row public.team_permission_overrides) returns jsonb language sql stable set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('id',p_row.id,'teamId',p_row.team_id,'memberId',p_row.member_id,'permission',p_row.permission,'allowed',p_row.allowed,'createdAt',p_row.created_at);
$$;
revoke all on function private.mobile_person_permission_row(public.team_permission_overrides) from public,anon,authenticated;
create function public.mobile_read_person_permission_override_state(p_team_id uuid,p_member_id uuid,p_target_member_id uuid,p_permission text) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_row public.team_permission_overrides%rowtype;v_member public.team_members%rowtype;v_current jsonb;v_override jsonb;
begin
 if p_target_member_id is null or p_permission is null or p_permission not in ('setlists.manage','songs.create','songs.edit','files.upload','members.manage','events.manage','team.manage') then raise exception 'Invalid person permission slot' using errcode='22023';end if;
 perform private.lock_mobile_role_permission_owner(p_team_id,p_member_id);
 select * into v_member from public.team_members where id=p_target_member_id and team_id=p_team_id;
 if found then
  select * into v_row from public.team_permission_overrides where team_id=p_team_id and member_id=p_target_member_id and role is null and permission=p_permission;
  if found then v_override:=private.mobile_person_permission_row(v_row);end if;
  v_current:=jsonb_build_object('member',private.mobile_member_role_snapshot(v_member),'override',v_override);
 end if;
 return jsonb_build_object('version',2,'targetMemberId',p_target_member_id,'permission',p_permission,'current',v_current,'fetchedAt',clock_timestamp());
end;
$$;
revoke all on function public.mobile_read_person_permission_override_state(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.mobile_read_person_permission_override_state(uuid,uuid,uuid,text) to authenticated;
create function public.mobile_apply_person_permission_override(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_keys text[];v_key text;v_base jsonb;v_base_member jsonb;v_base_override jsonb;v_nonce uuid;v_base_created timestamptz;v_member_created timestamptz;v_base_custom_id uuid;v_target uuid;
 v_row public.team_permission_overrides%rowtype;v_saved private.mobile_person_permission_override_receipts%rowtype;
 v_current jsonb;v_override jsonb;v_member public.team_members%rowtype;v_status text;v_result jsonb;v_recorded timestamptz;v_permission text;v_value text;
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected team owner required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','permission','base','value'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid person permission override request' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid override identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Override actor scope mismatch' using errcode='42501';end if;
 v_permission:=p_request->>'permission';v_value:=p_request->>'value';
 if jsonb_typeof(p_request->'permission') is distinct from 'string' or v_permission not in ('setlists.manage','songs.create','songs.edit','files.upload','members.manage','events.manage','team.manage') or jsonb_typeof(p_request->'value') is distinct from 'string' or v_value not in ('inherit','allow','deny') then raise exception 'Invalid person permission value' using errcode='22023';end if;
 v_base:=p_request->'base';v_keys:=array['member','override'];
 if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb then raise exception 'Invalid person selection base' using errcode='22023';end if;
 v_base_member:=v_base->'member';v_base_override:=v_base->'override';v_keys:=array['id','teamId','profileId','role','status','customRoleId','createdAt'];
 if jsonb_typeof(v_base_member) is distinct from 'object' or not v_base_member ?& v_keys or v_base_member-v_keys<>'{}'::jsonb then raise exception 'Invalid exact member base' using errcode='22023';end if;
 foreach v_key in array array['id','teamId','profileId'] loop
  if jsonb_typeof(v_base_member->v_key) is distinct from 'string' then raise exception 'Invalid selected member identity' using errcode='22023';end if;perform (v_base_member->>v_key)::uuid;
 end loop;
 v_target:=(v_base_member->>'id')::uuid;
 if (v_base_member->>'teamId')::uuid is distinct from p_team_id then raise exception 'Selected member team mismatch' using errcode='42501';end if;
 if v_target=p_member_id or (v_base_member->>'profileId')::uuid=v_actor or v_base_member->>'role'='owner' then raise exception 'Choose another non-owner person' using errcode='42501';end if;
 if jsonb_typeof(v_base_member->'role') is distinct from 'string' or v_base_member->>'role' not in ('admin','pastor','worship_leader','band_leader','band_member','dancer','media','member') or v_base_member->>'status' is distinct from 'active' then raise exception 'Choose an active non-owner member' using errcode='22023';end if;
 if v_base_member->'customRoleId'<>'null'::jsonb then
  if jsonb_typeof(v_base_member->'customRoleId') is distinct from 'string' then raise exception 'Invalid base custom role' using errcode='22023';end if;v_base_custom_id:=(v_base_member->>'customRoleId')::uuid;
 end if;
 if jsonb_typeof(v_base_member->'createdAt') is distinct from 'string' or (v_base_member->>'createdAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid member timestamp' using errcode='22023';end if;
 v_member_created:=(v_base_member->>'createdAt')::timestamptz;if not isfinite(v_member_created) then raise exception 'Invalid member timestamp' using errcode='22023';end if;
 if v_base_override<>'null'::jsonb then
  v_keys:=array['id','teamId','memberId','permission','allowed','createdAt'];
  if jsonb_typeof(v_base_override) is distinct from 'object' or not v_base_override ?& v_keys or v_base_override-v_keys<>'{}'::jsonb then raise exception 'Invalid exact override base' using errcode='22023';end if;
  foreach v_key in array array['id','teamId','memberId'] loop
   if jsonb_typeof(v_base_override->v_key) is distinct from 'string' then raise exception 'Invalid saved override identity' using errcode='22023';end if;perform (v_base_override->>v_key)::uuid;
  end loop;
  if (v_base_override->>'teamId')::uuid is distinct from p_team_id or (v_base_override->>'memberId')::uuid is distinct from v_target or v_base_override->>'permission' is distinct from v_permission then raise exception 'Override base slot mismatch' using errcode='22023';end if;
  if jsonb_typeof(v_base_override->'permission') is distinct from 'string' or jsonb_typeof(v_base_override->'allowed') is distinct from 'boolean' or jsonb_typeof(v_base_override->'createdAt') is distinct from 'string' or (v_base_override->>'createdAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid saved override fields' using errcode='22023';end if;
  v_base_created:=(v_base_override->>'createdAt')::timestamptz;if not isfinite(v_base_created) then raise exception 'Invalid override timestamp' using errcode='22023';end if;
 end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('role-permission-override:'||v_actor::text,0));
 perform private.lock_mobile_role_permission_owner(p_team_id,p_member_id);
 select * into v_saved from private.mobile_person_permission_override_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Override nonce belongs to another immutable intent' using errcode='22023';end if;return v_saved.result;
 end if;
 select * into v_member from public.team_members where id=v_target and team_id=p_team_id;
 if not found then v_status:='missing';
 else
  select * into v_row from public.team_permission_overrides where team_id=p_team_id and member_id=v_target and role is null and permission=v_permission for update;
  if found then v_override:=private.mobile_person_permission_row(v_row);end if;
  v_current:=jsonb_build_object('member',private.mobile_member_role_snapshot(v_member),'override',v_override);
  if v_member.profile_id is distinct from (v_base_member->>'profileId')::uuid or v_member.role::text is distinct from v_base_member->>'role' or v_member.status::text is distinct from 'active' or v_member.custom_role_id is distinct from v_base_custom_id or v_member.created_at is distinct from v_member_created
   or (v_base_override='null'::jsonb and v_override is not null) or (v_base_override<>'null'::jsonb and (v_override is null or v_row.id is distinct from (v_base_override->>'id')::uuid or v_row.allowed is distinct from (v_base_override->>'allowed')::boolean or v_row.created_at is distinct from v_base_created)) then v_status:='conflict';
  else
   perform public.set_team_permission_override(p_team_id,null,v_target,v_permission,case v_value when 'inherit' then null when 'allow' then true else false end);
   select * into v_row from public.team_permission_overrides where team_id=p_team_id and member_id=v_target and role is null and permission=v_permission;
   if v_value='inherit' then
    if found then raise exception 'Inherited person override not confirmed' using errcode='22023';end if;v_override:=null;
   else
    if not found or v_row.allowed is distinct from (v_value='allow') then raise exception 'Exact person override not confirmed' using errcode='22023';end if;
    v_override:=private.mobile_person_permission_row(v_row);
   end if;
   v_current:=jsonb_build_object('member',v_base_member,'override',v_override);v_status:='applied';
  end if;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'recordedAt',v_recorded);
 insert into private.mobile_person_permission_override_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_person_permission_override(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_person_permission_override(uuid,uuid,jsonb) to authenticated;
commit;
