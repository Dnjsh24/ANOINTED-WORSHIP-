-- Durable selected built-in role overrides; person overrides retain precedence.
begin;
create table private.mobile_role_permission_override_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_role_permission_override_receipts enable row level security;
revoke all on private.mobile_role_permission_override_receipts from public,anon,authenticated;
create trigger mobile_role_permission_override_receipt_immutable before update or delete on private.mobile_role_permission_override_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.lock_mobile_role_permission_owner(p_team uuid,p_member uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_actor public.team_members%rowtype;
begin
 if auth.uid() is null or p_team is null or p_member is null then raise exception 'Current selected team owner required' using errcode='42501';end if;
 -- Match the website setter's membership-first lock order before owner/slot checks.
 perform 1 from public.team_members where team_id=p_team order by id for update;
 perform 1 from public.teams where id=p_team for share;
 select m.* into v_actor from public.team_members m join public.teams t on t.id=m.team_id and t.owner_id=m.profile_id
 where m.id=p_member and m.team_id=p_team and m.profile_id=auth.uid() and m.status='active' and m.role='owner';
 if not found then raise exception 'Only the current team owner may edit role permissions' using errcode='42501';end if;
 if v_actor.custom_role_id is not null then perform 1 from public.custom_roles where id=v_actor.custom_role_id and team_id=p_team for share;end if;
 if not coalesce(private.has_team_permission(p_team,'team.manage'),false) then raise exception 'Current team-management authority required' using errcode='42501';end if;
end;
$$;
revoke all on function private.lock_mobile_role_permission_owner(uuid,uuid) from public,anon,authenticated;
create function private.mobile_role_permission_row(p_row public.team_permission_overrides) returns jsonb language sql stable set search_path='' set timezone='UTC' as $$
 select jsonb_build_object('id',p_row.id,'teamId',p_row.team_id,'role',p_row.role,'permission',p_row.permission,'allowed',p_row.allowed,'createdAt',p_row.created_at);
$$;
revoke all on function private.mobile_role_permission_row(public.team_permission_overrides) from public,anon,authenticated;
create function public.mobile_read_role_permission_override_state(p_team_id uuid,p_member_id uuid,p_target_role text,p_permission text) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_row public.team_permission_overrides%rowtype;v_current jsonb;
begin
 if p_target_role is null or p_target_role not in ('admin','pastor','worship_leader','band_leader','band_member','dancer','media','member') or p_permission is null or p_permission not in ('setlists.manage','songs.create','songs.edit','files.upload','members.manage','events.manage','team.manage') then raise exception 'Invalid built-in role permission slot' using errcode='22023';end if;
 perform private.lock_mobile_role_permission_owner(p_team_id,p_member_id);
 select * into v_row from public.team_permission_overrides where team_id=p_team_id and role::text=p_target_role and member_id is null and permission=p_permission;
 if found then v_current:=private.mobile_role_permission_row(v_row);end if;
 return jsonb_build_object('version',2,'targetRole',p_target_role,'permission',p_permission,'current',v_current,'fetchedAt',clock_timestamp());
end;
$$;
revoke all on function public.mobile_read_role_permission_override_state(uuid,uuid,text,text) from public,anon;
grant execute on function public.mobile_read_role_permission_override_state(uuid,uuid,text,text) to authenticated;
create function public.mobile_apply_role_permission_override(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_keys text[];v_key text;v_base jsonb;v_nonce uuid;v_base_created timestamptz;
 v_row public.team_permission_overrides%rowtype;v_saved private.mobile_role_permission_override_receipts%rowtype;
 v_current jsonb;v_status text;v_result jsonb;v_recorded timestamptz;v_role text;v_permission text;v_value text;
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected team owner required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','targetRole','permission','base','value'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid role permission override request' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid override identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Override actor scope mismatch' using errcode='42501';end if;
 v_role:=p_request->>'targetRole';v_permission:=p_request->>'permission';v_value:=p_request->>'value';
 if jsonb_typeof(p_request->'targetRole') is distinct from 'string' or v_role not in ('admin','pastor','worship_leader','band_leader','band_member','dancer','media','member') or jsonb_typeof(p_request->'permission') is distinct from 'string' or v_permission not in ('setlists.manage','songs.create','songs.edit','files.upload','members.manage','events.manage','team.manage') or jsonb_typeof(p_request->'value') is distinct from 'string' or v_value not in ('inherit','allow','deny') then raise exception 'Invalid built-in role permission value' using errcode='22023';end if;
 v_base:=p_request->'base';
 if v_base<>'null'::jsonb then
  v_keys:=array['id','teamId','role','permission','allowed','createdAt'];
  if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb then raise exception 'Invalid exact override base' using errcode='22023';end if;
  foreach v_key in array array['id','teamId'] loop
   if jsonb_typeof(v_base->v_key) is distinct from 'string' then raise exception 'Invalid saved override identity' using errcode='22023';end if;perform (v_base->>v_key)::uuid;
  end loop;
  if (v_base->>'teamId')::uuid is distinct from p_team_id or v_base->>'role' is distinct from v_role or v_base->>'permission' is distinct from v_permission then raise exception 'Override base slot mismatch' using errcode='22023';end if;
  if jsonb_typeof(v_base->'role') is distinct from 'string' or jsonb_typeof(v_base->'permission') is distinct from 'string' or jsonb_typeof(v_base->'allowed') is distinct from 'boolean' or jsonb_typeof(v_base->'createdAt') is distinct from 'string' or (v_base->>'createdAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid saved override fields' using errcode='22023';end if;
  v_base_created:=(v_base->>'createdAt')::timestamptz;
  if not isfinite(v_base_created) then raise exception 'Invalid override timestamp' using errcode='22023';end if;
 end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('role-permission-override:'||v_actor::text,0));
 perform private.lock_mobile_role_permission_owner(p_team_id,p_member_id);
 select * into v_saved from private.mobile_role_permission_override_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Override nonce belongs to another immutable intent' using errcode='22023';end if;return v_saved.result;
 end if;
 select * into v_row from public.team_permission_overrides where team_id=p_team_id and role::text=v_role and member_id is null and permission=v_permission for update;
 if found then v_current:=private.mobile_role_permission_row(v_row);end if;
 if (v_base='null'::jsonb and v_current is not null) or (v_base<>'null'::jsonb and (v_current is null or v_row.id is distinct from (v_base->>'id')::uuid or v_row.allowed is distinct from (v_base->>'allowed')::boolean or v_row.created_at is distinct from v_base_created)) then v_status:='conflict';
 else
  -- Reuse the website's deletion/reinsertion, audit log and permission semantics.
  perform public.set_team_permission_override(p_team_id,v_role,null,v_permission,case v_value when 'inherit' then null when 'allow' then true else false end);
  select * into v_row from public.team_permission_overrides where team_id=p_team_id and role::text=v_role and member_id is null and permission=v_permission;
  if v_value='inherit' then
   if found then raise exception 'Inherited override persistence not confirmed' using errcode='22023';end if;v_current:=null;
  else
   if not found or v_row.allowed is distinct from (v_value='allow') then raise exception 'Exact override persistence not confirmed' using errcode='22023';end if;
   v_current:=private.mobile_role_permission_row(v_row);
  end if;
  v_status:='applied';
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'recordedAt',v_recorded);
 insert into private.mobile_role_permission_override_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_role_permission_override(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_role_permission_override(uuid,uuid,jsonb) to authenticated;
commit;
