-- Storage bytes are verified by the authenticated API before this atomic CAS.
-- This function does not fetch URLs or delete objects. Existing direct own-profile
-- write policies remain unchanged; deployment-origin validation is an API boundary.
begin;
create table private.mobile_profile_avatar_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null,result jsonb not null,recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_profile_avatar_receipts enable row level security;
revoke all on private.mobile_profile_avatar_receipts from public,anon,authenticated;
create trigger mobile_profile_avatar_receipt_immutable before update or delete on private.mobile_profile_avatar_receipts for each row execute function private.guard_mobile_member_request_receipt();
create function private.require_mobile_profile_avatar_member(p_team uuid,p_member uuid) returns public.team_members language plpgsql security definer set search_path='' as $$
declare v_member public.team_members%rowtype;
begin
 if auth.uid() is null then raise exception 'Own active membership required' using errcode='42501';end if;
 perform 1 from public.team_members where team_id=p_team order by id for update;
 select * into v_member from public.team_members where id=p_member and team_id=p_team and profile_id=auth.uid() and status='active';
 if not found then raise exception 'Own active membership required' using errcode='42501';end if;return v_member;
end;
$$;
revoke all on function private.require_mobile_profile_avatar_member(uuid,uuid) from public,anon,authenticated;
create function public.mobile_read_profile_avatar_state(p_team_id uuid,p_member_id uuid) returns jsonb language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_member public.team_members%rowtype;v_url text;
begin
 v_member:=private.require_mobile_profile_avatar_member(p_team_id,p_member_id);
 select avatar_url into v_url from public.profiles where id=auth.uid();
 return jsonb_build_object('version',2,'current',jsonb_build_object('avatarUrl',v_url,'memberCreatedAt',v_member.created_at),'fetchedAt',clock_timestamp());
end;
$$;
revoke all on function public.mobile_read_profile_avatar_state(uuid,uuid) from public,anon;
grant execute on function public.mobile_read_profile_avatar_state(uuid,uuid) to authenticated;
create function public.mobile_apply_profile_avatar(p_team_id uuid,p_member_id uuid,p_request jsonb,p_avatar_url text) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_member public.team_members%rowtype;v_saved private.mobile_profile_avatar_receipts%rowtype;
 v_keys text[];v_key text;v_nonce uuid;v_base jsonb;v_value jsonb;v_created timestamptz;v_size integer;v_extension text;v_url text;v_status text;v_result jsonb;v_time timestamptz;
begin
 v_keys:=array['version','userId','teamId','memberId','requestNonce','base','value'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version' is distinct from '2'::jsonb then raise exception 'Invalid photo request' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key) is distinct from 'string' then raise exception 'Invalid photo scope' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if v_actor is null or p_team_id is null or p_member_id is null or (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Photo scope mismatch' using errcode='42501';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;v_base:=p_request->'base';v_keys:=array['avatarUrl','memberCreatedAt'];
 if jsonb_typeof(v_base) is distinct from 'object' or not v_base ?& v_keys or v_base-v_keys<>'{}'::jsonb or jsonb_typeof(v_base->'avatarUrl') not in ('string','null') or length(v_base->>'avatarUrl')>2048
 or jsonb_typeof(v_base->'memberCreatedAt') is distinct from 'string' or v_base->>'memberCreatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' then raise exception 'Invalid photo base' using errcode='22023';end if;
 v_created:=(v_base->>'memberCreatedAt')::timestamptz;if not isfinite(v_created) then raise exception 'Invalid photo incarnation' using errcode='22023';end if;
 v_value:=p_request->'value';v_keys:=array['objectPath','sha256','mimeType','sizeBytes'];
 if jsonb_typeof(v_value) is distinct from 'object' or not v_value ?& v_keys or v_value-v_keys<>'{}'::jsonb then raise exception 'Invalid photo object' using errcode='22023';end if;
 foreach v_key in array array['objectPath','sha256','mimeType'] loop
  if jsonb_typeof(v_value->v_key) is distinct from 'string' then raise exception 'Invalid photo metadata' using errcode='22023';end if;
 end loop;
 v_extension:=case v_value->>'mimeType' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else null end;
 if v_extension is null or v_value->>'objectPath' is distinct from v_actor::text||'/'||v_nonce::text||'.'||v_extension or v_value->>'sha256' !~ '^[a-f0-9]{64}$' or jsonb_typeof(v_value->'sizeBytes') is distinct from 'number' or v_value->>'sizeBytes' !~ '^[0-9]+$' then raise exception 'Photo must use its own immutable upload path' using errcode='22023';end if;
 v_size:=(v_value->>'sizeBytes')::integer;if v_size<1 or v_size>5242880 then raise exception 'Photo exceeds size limit' using errcode='22023';end if;
 if p_avatar_url is null or length(p_avatar_url)>2048 or p_avatar_url !~ '^https?://[A-Za-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/profile-avatars/'
 or split_part(p_avatar_url,'/storage/v1/object/public/profile-avatars/',2) is distinct from v_value->>'objectPath' then raise exception 'Invalid photo URL path' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('profile-avatar:'||v_actor::text,0));
 v_member:=private.require_mobile_profile_avatar_member(p_team_id,p_member_id);
 if v_member.created_at is distinct from v_created then raise exception 'Photo membership incarnation changed' using errcode='42501';end if;
 select * into v_saved from private.mobile_profile_avatar_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Photo nonce belongs to another immutable intent' using errcode='22023';end if;
  return v_saved.result;
 end if;
 select avatar_url into v_url from public.profiles where id=v_actor for update;
 if not found then raise exception 'Own profile required' using errcode='42501';end if;
 if v_url is distinct from v_base->>'avatarUrl' then v_status:='conflict';
 else
  -- Storage owns metadata. Clients cannot insert metadata rows through SQL;
  -- only an existing local-bucket object can become the selected photo.
  perform 1 from storage.objects where bucket_id='profile-avatars' and name=v_value->>'objectPath'
   and coalesce(owner_id,owner::text)=v_actor::text and metadata->>'mimetype'=v_value->>'mimeType' and (metadata->>'size')::bigint=v_size for share;
  if not found then raise exception 'Verified own uploaded object required' using errcode='22023';end if;
  update public.profiles set avatar_url=p_avatar_url where id=v_actor;v_url:=p_avatar_url;v_status:='applied';
 end if;
 v_time:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',jsonb_build_object('avatarUrl',v_url),'recordedAt',v_time);
 insert into private.mobile_profile_avatar_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_time);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_profile_avatar(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.mobile_apply_profile_avatar(uuid,uuid,jsonb,text) to authenticated;
commit;
