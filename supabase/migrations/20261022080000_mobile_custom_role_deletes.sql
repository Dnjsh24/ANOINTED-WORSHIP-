-- Delete only unused custom roles with current owner authority and exact-base CAS.
begin;
create table private.mobile_custom_role_delete_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_custom_role_delete_receipts enable row level security;
revoke all on private.mobile_custom_role_delete_receipts from public,anon,authenticated;
create trigger mobile_custom_role_delete_receipt_immutable before update or delete on private.mobile_custom_role_delete_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function public.mobile_apply_custom_role_delete(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_keys text[];v_key text;v_base jsonb;v_base_created timestamptz;v_actor_member public.team_members%rowtype;v_row public.custom_roles%rowtype;
 v_saved private.mobile_custom_role_delete_receipts%rowtype;v_current jsonb;v_reason text;v_status text;v_result jsonb;v_recorded timestamptz;
 v_known text[]:=array['team.manage','members.manage','join_requests.review','announcements.create','events.manage','events.review','events.request','songs.create','songs.edit','songs.review','songs.delete','setlists.manage','dance_notes.manage','dance_notes.review','files.upload','attendance.confirm','messages.send','prayer_requests.create'];
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected role owner required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','base'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid custom-role deletion' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key)<>'string' then raise exception 'Invalid role identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Role deletion scope mismatch' using errcode='42501';end if;
 v_base:=p_request->'base';v_keys:=array['id','teamId','name','permissions','createdAt'];
 if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb then raise exception 'Invalid exact role base' using errcode='22023';end if;
 if jsonb_typeof(v_base->'id') is distinct from 'string' or jsonb_typeof(v_base->'teamId') is distinct from 'string' then raise exception 'Invalid base scope' using errcode='22023';end if;
 if v_base->>'id' is distinct from ((v_base->>'id')::uuid)::text then raise exception 'Role IDs require canonical lowercase UUIDs' using errcode='22023';end if;
 if (v_base->>'teamId')::uuid is distinct from p_team_id then raise exception 'Role base team mismatch' using errcode='42501';end if;
 if jsonb_typeof(v_base->'name') is distinct from 'string' or length(v_base->>'name')>160 or jsonb_typeof(v_base->'permissions') is distinct from 'array' then raise exception 'Invalid exact base fields' using errcode='22023';end if;
 if jsonb_array_length(v_base->'permissions')>100 or exists(select 1 from jsonb_array_elements(v_base->'permissions') p where jsonb_typeof(p)<>'string' or not (p#>>'{}')=any(v_known)) then raise exception 'Unsupported base permissions' using errcode='22023';end if;
 if v_base->'createdAt'<>'null'::jsonb then
  if jsonb_typeof(v_base->'createdAt') is distinct from 'string' or (v_base->>'createdAt') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid base timestamp' using errcode='22023';end if;
  v_base_created:=(v_base->>'createdAt')::timestamptz;
  if not isfinite(v_base_created) then raise exception 'Invalid base timestamp' using errcode='22023';end if;
 end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;
 -- Share the creation actor lock before membership/name locks.
 perform pg_advisory_xact_lock(hashtextextended('custom-role-create:'||v_actor::text,0));
 perform 1 from public.team_members where team_id=p_team_id order by id for share;
 select * into v_actor_member from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=v_actor and status='active';
 if not found or v_actor_member.role<>'owner' then raise exception 'Current own owner membership required' using errcode='42501';end if;
 if v_actor_member.custom_role_id is not null then perform 1 from public.custom_roles where id=v_actor_member.custom_role_id and team_id=p_team_id for share;end if;
 if not coalesce(private.has_team_permission(p_team_id,'team.manage'),false) then raise exception 'Current team-management authority required' using errcode='42501';end if;
 select * into v_saved from private.mobile_custom_role_delete_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Role nonce belongs to another immutable intent' using errcode='22023';end if;return v_saved.result;
 end if;
 -- Membership locks precede role locks, matching existing member mutation flows.
 -- FOR UPDATE fences new FK key-share assignments, including inserts not yet visible.
 select * into v_row from public.custom_roles where id=(v_base->>'id')::uuid and team_id=p_team_id for update;
 if not found then v_status:='missing';
 else
  perform private.lock_custom_role_name(p_team_id,v_row.name);
  v_current:=jsonb_build_object('id',v_row.id,'teamId',v_row.team_id,'name',v_row.name,'permissions',v_row.permissions,'createdAt',v_row.created_at);
  if v_row.name is distinct from v_base->>'name' or to_jsonb(v_row.permissions) is distinct from v_base->'permissions' or v_row.created_at is distinct from v_base_created then v_status:='conflict';
  elsif exists(select 1 from public.team_members where custom_role_id=v_row.id) then
   v_status:='blocked';v_reason:='assigned_role';v_current:=v_base;
  else
   delete from public.custom_roles where id=v_row.id and team_id=p_team_id;
   v_status:='applied';v_current:=null;
  end if;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'reason',v_reason,'recordedAt',v_recorded);
 insert into private.mobile_custom_role_delete_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_custom_role_delete(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_custom_role_delete(uuid,uuid,jsonb) to authenticated;
commit;
