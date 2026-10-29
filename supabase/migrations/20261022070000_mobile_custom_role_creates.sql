-- Creation of unassigned roles follows the website's restrictive owner boundary.
begin;
create table private.mobile_custom_role_create_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_custom_role_create_receipts enable row level security;
revoke all on private.mobile_custom_role_create_receipts from public,anon,authenticated;
create trigger mobile_custom_role_create_receipt_immutable before update or delete on private.mobile_custom_role_create_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.lock_custom_role_name(p_team uuid,p_name text) returns void language sql volatile set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('custom-role-name:'||p_team::text||':'||lower(btrim(p_name)),0));
$$;
revoke all on function private.lock_custom_role_name(uuid,text) from public,anon,authenticated;
create function private.guard_custom_role_name() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.team_id=old.team_id and lower(btrim(new.name))=lower(btrim(old.name)) then return new;end if;
 if auth.uid() is null or not private.has_team_role(new.team_id,array['owner']::public.team_role[]) or not coalesce(private.has_team_permission(new.team_id,'team.manage'),false) then raise exception 'Current owner authority required for role creation' using errcode='42501';end if;
 perform private.lock_custom_role_name(new.team_id,new.name);
 if exists(select 1 from public.custom_roles r where r.team_id=new.team_id and lower(btrim(r.name))=lower(btrim(new.name)) and r.id<>new.id) then raise exception 'A custom role already exists for this name' using errcode='23505';end if;
 return new;
end;
$$;
revoke all on function private.guard_custom_role_name() from public,anon,authenticated;
create trigger custom_role_name_guard before insert or update of name,team_id on public.custom_roles for each row execute function private.guard_custom_role_name();
create function public.mobile_apply_custom_role_create(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_keys text[];v_key text;v_name text;v_permissions text[];v_actor_member public.team_members%rowtype;v_row public.custom_roles%rowtype;
 v_saved private.mobile_custom_role_create_receipts%rowtype;v_current jsonb;v_reason text;v_status text;v_result jsonb;v_recorded timestamptz;
 v_known text[]:=array['team.manage','members.manage','join_requests.review','announcements.create','events.manage','events.review','events.request','songs.create','songs.edit','songs.review','songs.delete','setlists.manage','dance_notes.manage','dance_notes.review','files.upload','attendance.confirm','messages.send','prayer_requests.create'];
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected role owner required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','name','permissions'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid custom-role creation' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key)<>'string' then raise exception 'Invalid role identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Role creation scope mismatch' using errcode='42501';end if;
 if jsonb_typeof(p_request->'name')<>'string' or length(p_request->>'name') not between 1 and 160 or p_request->>'name'<>btrim(p_request->>'name') or jsonb_typeof(p_request->'permissions')<>'array' then raise exception 'Invalid role fields' using errcode='22023';end if;
 if jsonb_array_length(p_request->'permissions')>100 or exists(select 1 from jsonb_array_elements(p_request->'permissions') p where jsonb_typeof(p)<>'string' or not (p#>>'{}')=any(v_known)) then raise exception 'Unsupported role permissions' using errcode='22023';end if;
 select coalesce(array_agg(p order by n),'{}') into v_permissions from jsonb_array_elements_text(p_request->'permissions') with ordinality a(p,n);
 if exists(select 1 from unnest(v_permissions) with ordinality a(p,n) where n>1 and p collate "C"<=v_permissions[n-1] collate "C") then raise exception 'Role permissions require unique canonical order' using errcode='22023';end if;
 v_name:=p_request->>'name';v_nonce:=(p_request->>'requestNonce')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('custom-role-create:'||v_actor::text,0));
 perform 1 from public.team_members where team_id=p_team_id order by id for share;
 select * into v_actor_member from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=v_actor and status='active';
 if not found or v_actor_member.role<>'owner' then raise exception 'Current own owner membership required' using errcode='42501';end if;
 if not coalesce(private.has_team_permission(p_team_id,'team.manage'),false) then raise exception 'Current team-management authority required' using errcode='42501';end if;
 select * into v_saved from private.mobile_custom_role_create_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Role nonce belongs to another immutable intent' using errcode='22023';end if;return v_saved.result;
 end if;
 perform private.lock_custom_role_name(p_team_id,v_name);
 if exists(select 1 from public.custom_roles r where r.team_id=p_team_id and lower(btrim(r.name))=lower(v_name)) then v_status:='blocked';v_reason:='existing_role';
 else
  insert into public.custom_roles(team_id,name,permissions) values(p_team_id,v_name,v_permissions) returning * into v_row;
  if v_row.team_id is distinct from p_team_id or v_row.name is distinct from v_name or v_row.permissions is distinct from v_permissions or v_row.created_at is null then raise exception 'Exact custom role persistence could not be confirmed' using errcode='22023';end if;
  v_status:='applied';v_current:=jsonb_build_object('id',v_row.id,'teamId',v_row.team_id,'name',v_row.name,'permissions',v_row.permissions,'createdAt',v_row.created_at);
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'reason',v_reason,'recordedAt',v_recorded);
 insert into private.mobile_custom_role_create_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_custom_role_create(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_custom_role_create(uuid,uuid,jsonb) to authenticated;
commit;
