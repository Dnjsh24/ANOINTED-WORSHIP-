-- Atomic native direct-channel opening. History never grants channel access.
begin;
create table private.mobile_direct_conversation_receipts(
 actor_id uuid not null,request_nonce uuid not null,request jsonb not null,result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_direct_conversation_receipts enable row level security;
revoke all on private.mobile_direct_conversation_receipts from public,anon,authenticated;
create trigger mobile_direct_conversation_receipt_immutable before update or delete on private.mobile_direct_conversation_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function public.mobile_open_direct_conversation(p_request jsonb) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_user uuid:=auth.uid();v_team uuid;v_member uuid;v_target uuid;v_nonce uuid;v_keys text[];v_key text;v_actor public.team_members%rowtype;v_other public.team_members%rowtype;v_saved private.mobile_direct_conversation_receipts%rowtype;v_channel uuid;v_candidate uuid;v_created boolean:=false;v_time timestamptz;v_result jsonb;
begin
 if v_user is null then raise exception 'Authenticated member required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','memberCreatedAt','requestNonce','target'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>8192 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid direct conversation intent' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce','memberCreatedAt'] loop if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid selected identity' using errcode='22023';end if;end loop;
 if (p_request->>'userId')::uuid<>v_user then raise exception 'Own account required' using errcode='42501';end if;
 v_team:=(p_request->>'teamId')::uuid;v_member:=(p_request->>'memberId')::uuid;v_nonce:=(p_request->>'requestNonce')::uuid;
 v_keys:=array['memberId','profileId','createdAt'];if jsonb_typeof(p_request->'target') is distinct from 'object' or not (p_request->'target') ?& v_keys or (p_request->'target')-v_keys<>'{}'::jsonb then raise exception 'Invalid exact teammate' using errcode='22023';end if;
 foreach v_key in array v_keys loop if jsonb_typeof(p_request->'target'->v_key) is distinct from 'string' then raise exception 'Invalid teammate snapshot' using errcode='22023';end if;end loop;
 if p_request->>'memberCreatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' or p_request#>>'{target,createdAt}' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Exact timestamp required' using errcode='22023';end if;
 v_target:=(p_request#>>'{target,memberId}')::uuid;
 -- Match native permission/member/ownership mutation lock ordering. Both sides
 -- of the same native pair serialize here, including reversed initiators.
 perform 1 from public.team_members where team_id=v_team order by id for update;
 select * into v_actor from public.team_members where id=v_member and team_id=v_team and profile_id=v_user and status='active';
 if not found or v_actor.created_at is distinct from (p_request->>'memberCreatedAt')::timestamptz then raise exception 'Original active membership required' using errcode='42501';end if;
 if v_actor.custom_role_id is not null then perform 1 from public.custom_roles where id=v_actor.custom_role_id and team_id=v_team for share;end if;
 -- has_team_permission only defines the seven editable permission defaults.
 -- Website rbac.ts grants messages.send to every current built-in role;
 -- custom permissions are additive and this permission has no override editor.
 if not coalesce(private.permission_override_value(v_team,'messages.send'),v_actor.role in ('owner','admin','pastor','worship_leader','band_leader','band_member','dancer','media','member')) then raise exception 'Current message permission required' using errcode='42501';end if;
 select * into v_other from public.team_members where id=v_target and team_id=v_team and status='active';
 if not found or v_other.profile_id=v_user or v_target=v_member or v_other.profile_id is distinct from (p_request#>>'{target,profileId}')::uuid or v_other.created_at is distinct from (p_request#>>'{target,createdAt}')::timestamptz then raise exception 'Original active teammate required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('direct-open-actor:'||v_user::text,0));
 select * into v_saved from private.mobile_direct_conversation_receipts where actor_id=v_user and request_nonce=v_nonce;
 if found then
  if v_saved.request is distinct from p_request then raise exception 'Nonce belongs to another conversation intent' using errcode='22023';end if;
  v_channel:=(v_saved.result->>'channelId')::uuid;
  perform 1 from public.message_channels where id=v_channel and team_id=v_team and channel_type='direct' for update;
  if not found then raise exception 'Original conversation unavailable' using errcode='42501';end if;
 else
  -- Never repair or reuse a legacy partial/multi-person direct channel.
  for v_candidate in select c.id from public.message_channels c where c.team_id=v_team and c.channel_type='direct' and exists(select 1 from public.message_channel_members cm where cm.channel_id=c.id and cm.team_member_id=v_member) and exists(select 1 from public.message_channel_members cm where cm.channel_id=c.id and cm.team_member_id=v_target) order by c.id for update loop
   if (select count(*) from public.message_channel_members where channel_id=v_candidate)=2 then v_channel:=v_candidate;exit;end if;
  end loop;
  if v_channel is null then
   insert into public.message_channels(team_id,name,channel_type,created_by) values(v_team,'Direct Message','direct',v_user) returning id into v_channel;
   insert into public.message_channel_members(channel_id,team_member_id) values(v_channel,v_member),(v_channel,v_target);v_created:=true;
  end if;
 end if;
 if (select count(*) from public.message_channel_members where channel_id=v_channel)<>2 or not exists(select 1 from public.message_channel_members where channel_id=v_channel and team_member_id=v_member) or not exists(select 1 from public.message_channel_members where channel_id=v_channel and team_member_id=v_target) then raise exception 'Original two-person conversation unavailable' using errcode='42501';end if;
 if v_saved.actor_id is not null then return v_saved.result;end if;
 v_time:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status','opened','channelId',v_channel,'created',v_created,'recordedAt',v_time);
 insert into private.mobile_direct_conversation_receipts(actor_id,request_nonce,request,result,recorded_at) values(v_user,v_nonce,p_request,v_result,v_time);
 return v_result;
end;
$$;
revoke all on function public.mobile_open_direct_conversation(jsonb) from public,anon;
grant execute on function public.mobile_open_direct_conversation(jsonb) to authenticated;
commit;
