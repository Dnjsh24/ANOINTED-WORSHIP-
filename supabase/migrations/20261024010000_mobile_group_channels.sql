-- Group-only membership commands with durable, private operation history.
begin;
create table private.mobile_group_channel_receipts(actor_id uuid not null,request_nonce uuid not null,request jsonb not null,result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce));
alter table private.mobile_group_channel_receipts enable row level security;
revoke all on private.mobile_group_channel_receipts from public,anon,authenticated;
create trigger mobile_group_channel_receipt_immutable before update or delete on private.mobile_group_channel_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function public.mobile_apply_group_channel(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_user uuid:=auth.uid();v_team uuid;v_member uuid;v_nonce uuid;v_operation text;v_keys text[];v_key text;v_actor public.team_members%rowtype;v_target public.team_members%rowtype;v_channel public.message_channels%rowtype;v_join public.message_channel_members%rowtype;v_saved private.mobile_group_channel_receipts%rowtype;v_channel_id uuid;v_target_id uuid;v_join_id uuid;v_status text:='applied';v_result jsonb;v_time timestamptz;v_base jsonb;v_target_base jsonb;v_join_base jsonb;v_name text;
begin
 if v_user is null then raise exception 'Authenticated membership required' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>16384 or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid group intent' using errcode='22023';end if;
 v_operation:=p_request->>'operation';v_keys:=array['version','userId','teamId','memberId','memberCreatedAt','requestNonce','operation'];
 if v_operation='create' then v_keys:=v_keys||array['value'];elsif v_operation in('add','remove') then v_keys:=v_keys||array['channel','target','baseJoin'];elsif v_operation='leave' then v_keys:=v_keys||array['channel','baseJoin'];else raise exception 'Unsupported group operation' using errcode='22023';end if;
 if not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb then raise exception 'Use exact group intent fields' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','memberCreatedAt','requestNonce','operation'] loop if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid group actor' using errcode='22023';end if;end loop;
 if (p_request->>'userId')::uuid<>v_user then raise exception 'Own actor required' using errcode='42501';end if;
 v_team:=(p_request->>'teamId')::uuid;v_member:=(p_request->>'memberId')::uuid;v_nonce:=(p_request->>'requestNonce')::uuid;
 if p_request->>'memberCreatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Exact actor timestamp required' using errcode='22023';end if;
 if v_operation='create' then
  if jsonb_typeof(p_request->'value') is distinct from 'object' or not (p_request->'value') ? 'name' or (p_request->'value')-array['name']<>'{}'::jsonb or jsonb_typeof(p_request#>'{value,name}') is distinct from 'string' then raise exception 'Invalid group name' using errcode='22023';end if;
  v_name:=p_request#>>'{value,name}';if length(v_name) not between 1 and 80 or v_name<>btrim(v_name) or v_name~'^[[:space:]]*$' then raise exception 'Invalid reviewed group name' using errcode='22023';end if;
 else
  v_base:=p_request->'channel';v_keys:=array['id','teamId','name','createdBy','createdAt'];if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb then raise exception 'Exact group snapshot required' using errcode='22023';end if;
  foreach v_key in array v_keys loop if jsonb_typeof(v_base->v_key) is distinct from 'string' then raise exception 'Invalid group snapshot' using errcode='22023';end if;end loop;
  v_channel_id:=(v_base->>'id')::uuid;perform(v_base->>'createdBy')::uuid;
  if (v_base->>'teamId')::uuid<>v_team or length(v_base->>'name') not between 1 and 500 or v_base->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid selected group' using errcode='22023';end if;
  if v_operation in('add','remove') then
   v_target_base:=p_request->'target';v_keys:=array['memberId','profileId','status','createdAt'];if jsonb_typeof(v_target_base) is distinct from 'object' or not v_target_base ?& v_keys or v_target_base-v_keys<>'{}'::jsonb then raise exception 'Exact teammate required' using errcode='22023';end if;
   foreach v_key in array v_keys loop if jsonb_typeof(v_target_base->v_key) is distinct from 'string' then raise exception 'Invalid teammate' using errcode='22023';end if;end loop;
   v_target_id:=(v_target_base->>'memberId')::uuid;perform(v_target_base->>'profileId')::uuid;
   if v_target_base->>'status' not in('active','inactive') or v_target_base->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' or v_operation='add' and v_target_base->>'status'<>'active' or v_operation='remove' and (v_target_id=v_member or (v_target_base->>'profileId')::uuid=v_user) then raise exception 'Invalid selected teammate operation' using errcode='22023';end if;
  else v_target_id:=v_member;end if;
  v_join_base:=p_request->'baseJoin';
  if v_operation='add' then if v_join_base is distinct from 'null'::jsonb then raise exception 'Add requires absent base membership' using errcode='22023';end if;
  else
   v_keys:=array['id','channelId','memberId','createdAt'];if jsonb_typeof(v_join_base) is distinct from 'object' or not v_join_base ?& v_keys or v_join_base-v_keys<>'{}'::jsonb then raise exception 'Exact channel membership required' using errcode='22023';end if;
   foreach v_key in array v_keys loop if jsonb_typeof(v_join_base->v_key) is distinct from 'string' then raise exception 'Invalid channel membership' using errcode='22023';end if;end loop;
   perform(v_join_base->>'id')::uuid;if (v_join_base->>'channelId')::uuid<>v_channel_id or (v_join_base->>'memberId')::uuid<>v_target_id or v_join_base->>'createdAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Membership snapshot scope differs' using errcode='22023';end if;
  end if;
 end if;
 -- Existing native permission/ownership mutations lock members in this order.
 perform 1 from public.team_members where team_id=v_team order by id for update;
 select * into v_actor from public.team_members where id=v_member and team_id=v_team and profile_id=v_user and status='active';
 if not found or v_actor.created_at is distinct from (p_request->>'memberCreatedAt')::timestamptz or v_operation<>'leave' and v_actor.role not in('owner','admin') then raise exception 'Current original group authority required' using errcode='42501';end if;
 if v_actor.custom_role_id is not null then perform 1 from public.custom_roles where id=v_actor.custom_role_id and team_id=v_team for share;end if;
 -- messages.send defaults match website rbac.ts, not the seven-setting helper.
 if not coalesce(private.permission_override_value(v_team,'messages.send'),v_actor.role in('owner','admin','pastor','worship_leader','band_leader','band_member','dancer','media','member')) then raise exception 'Current message permission required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('group-channel-actor:'||v_user::text,0));
 select * into v_saved from private.mobile_group_channel_receipts where actor_id=v_user and request_nonce=v_nonce;
 if found then if v_saved.request is distinct from p_request then raise exception 'Group nonce belongs to another intent' using errcode='22023';end if;return v_saved.result;end if;
 if v_operation='create' then
  insert into public.message_channels(team_id,name,channel_type,created_by) values(v_team,v_name,'group',v_user) returning id into v_channel_id;
  insert into public.message_channel_members(channel_id,team_member_id) values(v_channel_id,v_member) returning id into v_join_id;
 else
  select * into v_channel from public.message_channels where id=v_channel_id and team_id=v_team and channel_type='group' for update;
  if not found then v_status:='missing';
  elsif v_channel.name is distinct from v_base->>'name' or v_channel.created_by is distinct from (v_base->>'createdBy')::uuid or v_channel.created_at is distinct from (v_base->>'createdAt')::timestamptz then v_status:='conflict';
  else
   if v_operation in('add','remove') then
    select * into v_target from public.team_members where id=v_target_id and team_id=v_team;
    if not found or v_target.profile_id is distinct from (v_target_base->>'profileId')::uuid or v_target.status::text is distinct from v_target_base->>'status' or v_target.created_at is distinct from (v_target_base->>'createdAt')::timestamptz then v_status:='conflict';end if;
   end if;
   if v_status='applied' then
    select * into v_join from public.message_channel_members where channel_id=v_channel_id and team_member_id=v_target_id for update;
    if v_operation='add' then
     if found then v_status:='conflict';else insert into public.message_channel_members(channel_id,team_member_id) values(v_channel_id,v_target_id) returning id into v_join_id;end if;
    elsif not found or v_join.id is distinct from (v_join_base->>'id')::uuid or v_join.created_at is distinct from (v_join_base->>'createdAt')::timestamptz then v_status:='conflict';
    else delete from public.message_channel_members where id=v_join.id;end if;
   end if;
  end if;
 end if;
 v_time:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'channelId',v_channel_id,'joinId',v_join_id,'recordedAt',v_time);
 insert into private.mobile_group_channel_receipts(actor_id,request_nonce,request,result,recorded_at) values(v_user,v_nonce,p_request,v_result,v_time);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_group_channel(jsonb) from public,anon;
grant execute on function public.mobile_apply_group_channel(jsonb) to authenticated;
commit;
