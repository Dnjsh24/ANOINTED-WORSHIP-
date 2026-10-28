-- Saved invitations only: no email delivery, membership grant or fabricated expiry.
begin;
create table private.mobile_member_invitation_receipts (
 actor_id uuid not null,request_nonce uuid not null,team_id uuid not null,member_id uuid not null,
 request jsonb not null check(jsonb_typeof(request)='object'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_nonce)
);
alter table private.mobile_member_invitation_receipts enable row level security;
revoke all on private.mobile_member_invitation_receipts from public,anon,authenticated;
create function private.guard_mobile_member_invitation_receipt() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Invitation receipts are immutable' using errcode='42501';end;
$$;
revoke all on function private.guard_mobile_member_invitation_receipt() from public,anon,authenticated;
create trigger mobile_member_invitation_receipt_immutable before update or delete on private.mobile_member_invitation_receipts for each row execute function private.guard_mobile_member_invitation_receipt();

create function private.lock_member_invitation_email(p_team uuid,p_email text) returns void language sql volatile set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('member-invitation-email:'||p_team::text||':'||lower(btrim(p_email)),0));
$$;
revoke all on function private.lock_member_invitation_email(uuid,text) from public,anon,authenticated;
-- Serializes native and existing website inserts without rewriting legacy duplicates.
create function private.guard_member_invitation_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.team_id=old.team_id and lower(btrim(new.email))=lower(btrim(old.email)) then return new;end if;
 if auth.uid() is null or not coalesce(private.has_team_permission(new.team_id,'members.manage'),false) then raise exception 'Current invitation authority required' using errcode='42501';end if;
 perform private.lock_member_invitation_email(new.team_id,new.email);
 if exists(select 1 from public.team_invitations i where i.team_id=new.team_id and lower(btrim(i.email))=lower(btrim(new.email)) and i.id<>new.id) then
  raise exception 'An invitation already exists for this team and email' using errcode='23505';
 end if;
 return new;
end;
$$;
revoke all on function private.guard_member_invitation_email() from public,anon,authenticated;
create trigger member_invitation_email_guard before insert or update of email,team_id on public.team_invitations for each row execute function private.guard_member_invitation_email();

create function public.mobile_apply_member_invitation(p_team_id uuid,p_member_id uuid,p_request jsonb) returns jsonb
language plpgsql security definer set search_path='' set timezone='UTC' as $$
declare v_actor uuid:=auth.uid();v_nonce uuid;v_keys text[];v_key text;v_email text;v_role public.team_role;v_message text;
 v_actor_member public.team_members%rowtype;v_row public.team_invitations%rowtype;v_saved private.mobile_member_invitation_receipts%rowtype;
 v_current jsonb;v_reason text;v_status text;v_result jsonb;v_recorded timestamptz;
begin
 if v_actor is null or p_team_id is null or p_member_id is null then raise exception 'Selected invitation manager required' using errcode='42501';end if;
 v_keys:=array['version','userId','teamId','memberId','requestNonce','email','role','message'];
 if p_request is null or jsonb_typeof(p_request)<>'object' or octet_length(p_request::text)>32768 or not p_request ?& v_keys or p_request-v_keys<>'{}'::jsonb or p_request->'version'<>'2'::jsonb then raise exception 'Invalid invitation request' using errcode='22023';end if;
 foreach v_key in array array['userId','teamId','memberId','requestNonce'] loop
  if jsonb_typeof(p_request->v_key)<>'string' then raise exception 'Invalid invitation identity' using errcode='22023';end if;perform (p_request->>v_key)::uuid;
 end loop;
 if (p_request->>'userId')::uuid is distinct from v_actor or (p_request->>'teamId')::uuid is distinct from p_team_id or (p_request->>'memberId')::uuid is distinct from p_member_id then raise exception 'Invitation scope mismatch' using errcode='42501';end if;
 if jsonb_typeof(p_request->'email')<>'string' or jsonb_typeof(p_request->'role')<>'string' or jsonb_typeof(p_request->'message') not in ('string','null') then raise exception 'Invalid invitation fields' using errcode='22023';end if;
 v_email:=p_request->>'email';v_role:=(p_request->>'role')::public.team_role;v_message:=p_request->>'message';
 if v_email<>lower(btrim(v_email)) or length(v_email)>254 or v_email!~'^(?!\.)(?!.*\.\.)([a-z0-9_''+\-.]*)[a-z0-9_+-]@([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$'
  or v_message is not null and (v_message<>btrim(v_message) or length(v_message)<1 or length(v_message)>1000) then raise exception 'Invalid canonical invitation fields' using errcode='22023';end if;
 v_nonce:=(p_request->>'requestNonce')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('member-invitation-actor:'||v_actor::text,0));
 perform 1 from public.team_members where team_id=p_team_id order by id for share;
 select * into v_actor_member from public.team_members where id=p_member_id and team_id=p_team_id and profile_id=v_actor and status='active';
 if not found then raise exception 'Current own management membership required' using errcode='42501';end if;
 if v_actor_member.custom_role_id is not null then perform 1 from public.custom_roles where id=v_actor_member.custom_role_id and team_id=p_team_id for share;end if;
 if not coalesce(private.has_team_permission(p_team_id,'members.manage'),false) or v_role<>'member' and v_actor_member.role not in ('owner','admin') then raise exception 'Current management and role-assignment authority required' using errcode='42501';end if;
 select * into v_saved from private.mobile_member_invitation_receipts where actor_id=v_actor and request_nonce=v_nonce;
 if found then
  if v_saved.team_id<>p_team_id or v_saved.member_id<>p_member_id or v_saved.request is distinct from p_request then raise exception 'Invitation nonce belongs to another immutable intent' using errcode='22023';end if;
  return v_saved.result;
 end if;
 perform private.lock_member_invitation_email(p_team_id,v_email);
 if v_role in ('owner','admin') then v_status:='blocked';v_reason:='privileged_role';
 elsif exists(select 1 from public.team_invitations i where i.team_id=p_team_id and lower(btrim(i.email))=v_email) then v_status:='blocked';v_reason:='existing_invitation';
 else
  -- Stabilize matching profiles against concurrent email changes or membership FK inserts.
  perform 1 from public.profiles p where lower(btrim(p.email))=v_email order by p.id for update;
  if exists(select 1 from public.team_members m join public.profiles p on p.id=m.profile_id where m.team_id=p_team_id and lower(btrim(p.email))=v_email) then v_status:='blocked';v_reason:='existing_membership';
  else
   insert into public.team_invitations(team_id,email,role,message,invited_by,status) values(p_team_id,v_email,v_role,v_message,v_actor,'pending') returning * into v_row;
   if v_row.team_id is distinct from p_team_id or v_row.email is distinct from v_email or v_row.role is distinct from v_role or v_row.message is distinct from v_message or v_row.invited_by is distinct from v_actor or v_row.status<>'pending' or v_row.created_at is distinct from v_row.updated_at then raise exception 'The exact pending invitation was not persisted' using errcode='22023';end if;
   v_status:='applied';v_current:=jsonb_build_object('id',v_row.id,'teamId',v_row.team_id,'email',v_row.email,'role',v_row.role,'message',v_row.message,'status',v_row.status,'invitedBy',v_row.invited_by,'createdAt',v_row.created_at,'updatedAt',v_row.updated_at,'expiresAt',null);
  end if;
 end if;
 v_recorded:=clock_timestamp();v_result:=jsonb_build_object('version',2,'request',p_request,'status',v_status,'current',v_current,'reason',v_reason,'recordedAt',v_recorded);
 insert into private.mobile_member_invitation_receipts(actor_id,request_nonce,team_id,member_id,request,result,recorded_at) values(v_actor,v_nonce,p_team_id,p_member_id,p_request,v_result,v_recorded);
 return v_result;
end;
$$;
revoke all on function public.mobile_apply_member_invitation(uuid,uuid,jsonb) from public,anon;
grant execute on function public.mobile_apply_member_invitation(uuid,uuid,jsonb) to authenticated;
commit;
