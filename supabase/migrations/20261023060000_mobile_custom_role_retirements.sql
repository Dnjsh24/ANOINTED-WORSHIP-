-- Atomic bounded reassignment and deletion of an exact custom role.
begin;
create table private.mobile_custom_role_retirement_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_custom_role_retirement_receipts enable row level security;
revoke all on private.mobile_custom_role_retirement_receipts from public,anon,authenticated;
create trigger mobile_custom_role_retirement_receipt_immutable before update or delete on private.mobile_custom_role_retirement_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.lock_mobile_custom_role_retirement_owner(p_team uuid,p_member uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.lock_mobile_role_permission_owner(p_team,p_member);
 if not coalesce(private.has_team_permission(p_team,'members.manage'),false) then raise exception 'Current member-management authority required' using errcode='42501';end if;
end;
$$;
revoke all on function private.lock_mobile_custom_role_retirement_owner(uuid,uuid) from public,anon,authenticated;
create function private.mobile_custom_role_retirement_selection(p_role public.custom_roles) returns jsonb language sql volatile set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('role',jsonb_build_object('id',p_role.id,'teamId',p_role.team_id,'name',p_role.name,'permissions',p_role.permissions,'createdAt',p_role.created_at),
 'members',coalesce((select jsonb_agg(private.mobile_member_role_snapshot(m) order by id) from public.team_members m where custom_role_id=p_role.id),'[]'::jsonb));
$$;
revoke all on function private.mobile_custom_role_retirement_selection(public.custom_roles) from public,anon,authenticated;
create function public.mobile_read_custom_role_retirement_state(p_team_id uuid,p_member_id uuid,p_role_id uuid) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_role public.custom_roles%rowtype;v_current jsonb;v_count integer:=0;v_reason text;
begin
 if p_role_id is null then raise exception 'Selected role required' using errcode='22023';end if;
 perform private.lock_mobile_custom_role_retirement_owner(p_team_id,p_member_id);
 -- The role lock fences new assignment FK key-share checks. Re-read assignments
 -- after any wait so an earlier committed insert cannot be omitted.
 select * into v_role from public.custom_roles where id=p_role_id and team_id=p_team_id for update;
 if found then
  perform 1 from public.team_members where custom_role_id=p_role_id order by id for update;
  select count(*) into v_count from public.team_members where custom_role_id=p_role_id;
  if exists(select 1 from public.team_members where custom_role_id=p_role_id and team_id<>p_team_id) then raise exception 'Role assignment team mismatch' using errcode='42501';end if;
  if v_count>100 then v_reason:='member_limit';else v_current:=private.mobile_custom_role_retirement_selection(v_role);end if;
 end if;
 return jsonb_build_object('version',2,'roleId',p_role_id,'current',v_current,'assignedCount',v_count,'reason',v_reason,'fetchedAt',clock_timestamp());
end;
$$;
revoke all on function public.mobile_read_custom_role_retirement_state(uuid,uuid,uuid) from public,anon;
grant execute on function public.mobile_read_custom_role_retirement_state(uuid,uuid,uuid) to authenticated;
create function public.mobile_apply_custom_role_retirement(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_keys text[];v_key text;v_base jsonb;v_base_role jsonb;v_base_members jsonb;v_item jsonb;
 v_nonce uuid;v_role_id uuid;v_time timestamptz;v_prior uuid;v_member_id uuid;v_custom_id uuid;v_role public.custom_roles%rowtype;v_member public.team_members%rowtype;
 v_saved private.mobile_custom_role_retirement_receipts%rowtype;v_current jsonb;v_status text;v_reason text;v_result jsonb;v_recorded timestamptz;v_count integer;v_affected integer;
 v_member_before jsonb;v_members_before jsonb;v_members_after jsonb;v_role_base_time timestamptz;
 v_known text[]:=array['team.manage','members.manage','join_requests.review','announcements.create','events.manage','events.review','events.request','songs.create','songs.edit','songs.review','songs.delete','setlists.manage','dance_notes.manage','dance_notes.review','files.upload','attendance.confirm','messages.send','prayer_requests.create'];
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected team owner required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','base','replacementRole'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>131072 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid role retirement' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid retirement identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Retirement scope mismatch' using errcode='42501';end if;
 if jsonb_typeof(p_request->'replacementRole') is distinct from 'string' or p_request->>'replacementRole' not in ('admin','pastor','worship_leader','band_leader','band_member','dancer','media','member') then raise exception 'Choose a non-owner replacement role' using errcode='22023';end if;
 v_base:=p_request->'base';v_keys:=array['role','members'];
 if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb then raise exception 'Invalid retirement selection' using errcode='22023';end if;
 v_base_role:=v_base->'role';v_base_members:=v_base->'members';v_keys:=array['id','teamId','name','permissions','createdAt'];
 if jsonb_typeof(v_base_role) is distinct from 'object' or not v_base_role ?& v_keys or v_base_role-v_keys<>'{}'::jsonb or jsonb_typeof(v_base_members) is distinct from 'array' then raise exception 'Invalid exact retirement role or members' using errcode='22023';end if;
 foreach v_key in array array['id','teamId'] loop
  if jsonb_typeof(v_base_role->v_key) is distinct from 'string' then raise exception 'Invalid role identity' using errcode='22023';end if;perform (v_base_role->>v_key)::uuid;
 end loop;
 v_role_id:=(v_base_role->>'id')::uuid;
 if v_base_role->>'id'<>v_role_id::text then raise exception 'Use canonical custom role ID' using errcode='22023';end if;
 if (v_base_role->>'teamId')::uuid is distinct from p_team_id then raise exception 'Role base team mismatch' using errcode='42501';end if;
 if jsonb_typeof(v_base_role->'name') is distinct from 'string' or length(v_base_role->>'name')>160 or jsonb_typeof(v_base_role->'permissions') is distinct from 'array' then raise exception 'Invalid exact role fields' using errcode='22023';end if;
 if jsonb_array_length(v_base_role->'permissions')>100 or exists(select 1 from jsonb_array_elements(v_base_role->'permissions') p where jsonb_typeof(p)<>'string' or not (p#>>'{}')=any(v_known)) then raise exception 'Unsupported role permissions' using errcode='22023';end if;
 if v_base_role->'createdAt'<>'null'::jsonb then
  if jsonb_typeof(v_base_role->'createdAt') is distinct from 'string' or (v_base_role->>'createdAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid role timestamp' using errcode='22023';end if;
  v_role_base_time:=(v_base_role->>'createdAt')::timestamptz;if not isfinite(v_role_base_time) then raise exception 'Invalid role timestamp' using errcode='22023';end if;
 end if;
 if jsonb_array_length(v_base_members)>100 then raise exception 'Retirement assignment limit exceeded' using errcode='22023';end if;
 for v_item in select value from jsonb_array_elements(v_base_members) loop
  v_keys:=array['id','teamId','profileId','role','status','customRoleId','createdAt'];
  if jsonb_typeof(v_item) is distinct from 'object' or not v_item ?& v_keys or v_item-v_keys<>'{}'::jsonb then raise exception 'Invalid exact assigned member' using errcode='22023';end if;
  foreach v_key in array array['id','teamId','profileId','customRoleId'] loop
   if jsonb_typeof(v_item->v_key) is distinct from 'string' then raise exception 'Invalid assigned member identity' using errcode='22023';end if;perform (v_item->>v_key)::uuid;
  end loop;
  v_member_id:=(v_item->>'id')::uuid;
  if v_item->>'id'<>v_member_id::text or v_prior is not null and v_member_id<=v_prior then raise exception 'Assignments require canonical unique ordered IDs' using errcode='22023';end if;v_prior:=v_member_id;
  if (v_item->>'teamId')::uuid is distinct from p_team_id or (v_item->>'customRoleId')::uuid is distinct from v_role_id then raise exception 'Assigned member scope mismatch' using errcode='22023';end if;
  if jsonb_typeof(v_item->'role') is distinct from 'string' or v_item->>'role' not in ('owner','admin','pastor','worship_leader','band_leader','band_member','dancer','media','member') or jsonb_typeof(v_item->'status') is distinct from 'string' or v_item->>'status' not in ('active','inactive') then raise exception 'Invalid assigned member role/status' using errcode='22023';end if;
  if jsonb_typeof(v_item->'createdAt') is distinct from 'string' or (v_item->>'createdAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid assigned member timestamp' using errcode='22023';end if;
  v_time:=(v_item->>'createdAt')::timestamptz;if not isfinite(v_time) then raise exception 'Invalid assigned member timestamp' using errcode='22023';end if;
 end loop;
 v_nonce:=(p_request->>'requestNonce')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('custom-role-retirement:'||v_actor::text,0));
 perform private.lock_mobile_custom_role_retirement_owner(p_team_id,p_member_id);
 select * into v_saved from private.mobile_custom_role_retirement_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Retirement nonce belongs to another immutable intent' using errcode='22023';end if;return v_saved.result;
 end if;
 select * into v_role from public.custom_roles where id=v_role_id and team_id=p_team_id for update;
 if not found then v_status:='missing';
 else
  -- Acquire the FK parent lock before reading assignments. Inserts that committed
  -- during this lock wait are visible in the next statement; later inserts wait
  -- on this role until retirement commits and then fail their FK check.
  perform 1 from public.team_members where custom_role_id=v_role_id order by id for update;
  select count(*) into v_count from public.team_members where custom_role_id=v_role_id;
  if exists(select 1 from public.team_members where custom_role_id=v_role_id and team_id<>p_team_id) then raise exception 'Role assignment team mismatch' using errcode='42501';end if;
  if v_count>100 then v_status:='blocked';v_reason:='member_limit';
  else
   v_current:=private.mobile_custom_role_retirement_selection(v_role);
   if v_role.name is distinct from v_base_role->>'name' or to_jsonb(v_role.permissions) is distinct from v_base_role->'permissions' or v_role.created_at is distinct from v_role_base_time or v_count<>jsonb_array_length(v_base_members) then v_status:='conflict';
   else
    for v_item in select value from jsonb_array_elements(v_base_members) loop
     select * into v_member from public.team_members where id=(v_item->>'id')::uuid and custom_role_id=v_role_id and team_id=p_team_id;
     if not found or v_member.profile_id is distinct from (v_item->>'profileId')::uuid or v_member.role::text is distinct from v_item->>'role' or v_member.status::text is distinct from v_item->>'status' or v_member.created_at is distinct from (v_item->>'createdAt')::timestamptz then v_status:='conflict';exit;end if;
    end loop;
   end if;
   if v_status is null and exists(select 1 from public.team_members where custom_role_id=v_role_id and (role='owner' or id=p_member_id or profile_id=v_actor)) then v_status:='blocked';v_reason:='protected_member';v_current:=v_base;end if;
   if v_status is null then
    select coalesce(jsonb_agg(to_jsonb(m)-array['role','custom_role_id','updated_at'] order by id),'[]') into v_members_before from public.team_members m where custom_role_id=v_role_id;
    update public.team_members set role=(p_request->>'replacementRole')::public.team_role,custom_role_id=null where custom_role_id=v_role_id and team_id=p_team_id;
    get diagnostics v_affected=row_count;
    if v_affected<>v_count then raise exception 'Complete assignment update not confirmed' using errcode='22023';end if;
    select coalesce(jsonb_agg(to_jsonb(m)-array['role','custom_role_id','updated_at'] order by id),'[]') into v_members_after from public.team_members m where id in (select (item->>'id')::uuid from jsonb_array_elements(v_base_members) item);
    if v_members_before is distinct from v_members_after or exists(select 1 from public.team_members where custom_role_id=v_role_id) then raise exception 'Exact assignment preservation not confirmed' using errcode='22023';end if;
    if exists(select 1 from public.team_members where id in (select (item->>'id')::uuid from jsonb_array_elements(v_base_members) item) and (role::text<>p_request->>'replacementRole' or custom_role_id is not null)) then raise exception 'Replacement role not confirmed' using errcode='22023';end if;
    delete from public.custom_roles where id=v_role_id and team_id=p_team_id;
    if not found then raise exception 'Role deletion not confirmed' using errcode='22023';end if;
    v_status:='applied';v_current:=null;
   end if;
  end if;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'reason',v_reason,'recordedAt',v_recorded);
 insert into private.mobile_custom_role_retirement_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_custom_role_retirement(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_custom_role_retirement(uuid,uuid,jsonb) to authenticated;
commit;
