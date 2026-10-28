-- Additive own-profile editing foundation. Source only; no hosted application authorized.
begin;

create table private.mobile_profile_edit_receipts (
 actor_id uuid not null, request_nonce uuid not null, team_id uuid not null, member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'), result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(), primary key(actor_id,request_nonce)
);
alter table private.mobile_profile_edit_receipts enable row level security;
revoke all on private.mobile_profile_edit_receipts from public,anon,authenticated;
-- No foreign-key cascades: an immutable receipt is retained if membership is
-- removed. Active own membership is required before any replay can disclose it.
create function private.guard_mobile_profile_edit_receipt() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Profile edit receipts are immutable' using errcode='42501'; end;
$$;
revoke all on function private.guard_mobile_profile_edit_receipt() from public,anon,authenticated;
create trigger mobile_profile_edit_receipt_immutable before update or delete on private.mobile_profile_edit_receipts
 for each row execute function private.guard_mobile_profile_edit_receipt();

create function private.validate_mobile_profile_fields(p_value jsonb,p_base boolean) returns void language plpgsql set search_path='' as $$
declare v_key text;v_item jsonb;v_date date;
begin
 if p_value is null or jsonb_typeof(p_value)<>'object' or not p_value ?& array['fullName','birthday','ministries','teamAnniversary']
   or p_value-array['fullName','birthday','ministries','teamAnniversary']<>'{}'::jsonb then raise exception 'Invalid profile fields' using errcode='22023';end if;
 if not (p_base and p_value->'fullName'='null'::jsonb) and (jsonb_typeof(p_value->'fullName') is distinct from 'string' or length(p_value->>'fullName')>160
   or (not p_base and (length(trim(p_value->>'fullName'))<1 or p_value->>'fullName'<>trim(p_value->>'fullName')))) then raise exception 'Invalid full name' using errcode='22023';end if;
 if jsonb_typeof(p_value->'ministries') is distinct from 'array' or jsonb_array_length(p_value->'ministries')>100 then raise exception 'Invalid ministries' using errcode='22023';end if;
 for v_item in select value from jsonb_array_elements(p_value->'ministries') loop
  if jsonb_typeof(v_item)<>'string' or length(v_item#>>'{}')>160 then raise exception 'Invalid ministry' using errcode='22023';end if;
 end loop;
 foreach v_key in array array['birthday','teamAnniversary'] loop
  if p_value->v_key<>'null'::jsonb then
   if jsonb_typeof(p_value->v_key)<>'string' or (p_value->>v_key)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid profile date' using errcode='22023';end if;
   v_date:=(p_value->>v_key)::date;
   if v_date::text<>p_value->>v_key then raise exception 'Invalid profile date' using errcode='22023';end if;
  end if;
 end loop;
end;
$$;
revoke all on function private.validate_mobile_profile_fields(jsonb,boolean) from public,anon,authenticated;

create function public.mobile_apply_profile_edit(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_profile public.profiles%rowtype;v_member public.team_members%rowtype;
 v_receipt private.mobile_profile_edit_receipts%rowtype;v_current jsonb;v_result jsonb;v_recorded timestamptz;
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected own membership required' using errcode='42501';end if;
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>65536 or not p_request ?& array['version','userId','teamId','memberId','requestNonce','base','value']
   or p_request-array['version','userId','teamId','memberId','requestNonce','base','value']<>'{}'::jsonb or p_request->'version'<>'2'::jsonb then raise exception 'Invalid profile edit request' using errcode='22023';end if;
 if jsonb_typeof(p_request->'userId')<>'string' or jsonb_typeof(p_request->'teamId')<>'string' or jsonb_typeof(p_request->'memberId')<>'string' or jsonb_typeof(p_request->'requestNonce')<>'string' then raise exception 'Invalid profile identity' using errcode='22023';end if;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Profile scope mismatch' using errcode='42501';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;
 perform private.validate_mobile_profile_fields(p_request->'base',true);perform private.validate_mobile_profile_fields(p_request->'value',false);
 -- Actor-wide serialization keeps nonce identity stable across selected teams.
 perform pg_advisory_xact_lock(hashtextextended('profile-edit:'||v_actor::text,0));
 select * into v_profile from public.profiles where id=v_actor for update;
 if not found then raise exception 'Own profile unavailable' using errcode='42501';end if;
 select * into v_member from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=v_actor and status='active' for update;
 if not found or not private.is_approved_member(p_team_id) then raise exception 'Own active membership unavailable' using errcode='42501';end if;
 select * into v_receipt from private.mobile_profile_edit_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_receipt.team_id<>p_team_id or v_receipt.member_id<>p_member_id or v_receipt.request is distinct from p_request then raise exception 'Profile nonce already belongs to another intent' using errcode='22023';end if;
  return v_receipt.result;
 end if;
 v_current:=jsonb_build_object('fullName',v_profile.full_name,'birthday',v_profile.birthday,'ministries',coalesce(to_jsonb(v_member.ministries),'[]'::jsonb),'teamAnniversary',v_member.team_anniversary);
 v_recorded:=clock_timestamp();
 if v_current is distinct from p_request->'base' then
  v_result:=jsonb_build_object('version',2,'request',p_request,'status','conflict','current',v_current,'recordedAt',v_recorded);
 else
  -- Existing own-profile/member guards still execute. Only these four website
  -- fields change; email/avatar/roles/custom grants/other memberships are untouched.
  update public.profiles set full_name=p_request#>>'{value,fullName}',birthday=(p_request#>>'{value,birthday}')::date where id=v_actor;
  update public.team_members set ministries=array(select jsonb_array_elements_text(p_request#>'{value,ministries}')),team_anniversary=(p_request#>>'{value,teamAnniversary}')::date
    where id=p_member_id and team_id=p_team_id and profile_id=v_actor and status='active';
  if not found then raise exception 'Own membership changed' using errcode='42501';end if;
  select jsonb_build_object('fullName',p.full_name,'birthday',p.birthday,'ministries',coalesce(to_jsonb(m.ministries),'[]'::jsonb),'teamAnniversary',m.team_anniversary) into v_current
    from public.profiles p join public.team_members m on m.profile_id=p.id where p.id=v_actor and m.id=p_member_id and m.team_id=p_team_id and m.status='active';
  if v_current is distinct from p_request->'value' then raise exception 'Profile edit did not persist exact requested fields' using errcode='22023';end if;
  v_result:=jsonb_build_object('version',2,'request',p_request,'status','applied','current',v_current,'recordedAt',v_recorded);
 end if;
 insert into private.mobile_profile_edit_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_profile_edit(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_profile_edit(uuid,uuid,jsonb) to authenticated;
commit;
