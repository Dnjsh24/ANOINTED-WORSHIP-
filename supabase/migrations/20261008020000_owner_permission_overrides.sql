-- Additive owner-controlled role and person permissions. Apply after the full
-- preceding migration chain. Existing defaults remain unchanged without overrides.
create table public.team_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  role public.team_role,
  member_id uuid,
  permission text not null check (permission in ('setlists.manage','songs.create','songs.edit','files.upload','members.manage','events.manage','team.manage')),
  allowed boolean not null,
  created_at timestamptz not null default now(),
  check ((role is not null)::integer + (member_id is not null)::integer = 1),
  check (role is null or role <> 'owner')
);
alter table public.team_members add constraint team_members_id_team_unique unique(id,team_id);
alter table public.team_permission_overrides add constraint permission_member_same_team
  foreign key(member_id,team_id) references public.team_members(id,team_id) on delete cascade;
create unique index permission_override_role_unique on public.team_permission_overrides(team_id,role,permission) where role is not null;
create unique index permission_override_person_unique on public.team_permission_overrides(team_id,member_id,permission) where member_id is not null;
alter table public.team_permission_overrides enable row level security;
grant select on public.team_permission_overrides to authenticated;
revoke all on public.team_permission_overrides from anon;
revoke insert,update,delete,truncate,references,trigger on public.team_permission_overrides from authenticated;
create policy "Active team reads permission overrides" on public.team_permission_overrides for select to authenticated
  using(private.is_approved_member(team_id));

create function private.permission_override_value(p_team uuid,p_permission text) returns boolean
language sql stable security definer set search_path='' as $$
  select case when tm.role='owner' then true else coalesce(
    (select o.allowed from public.team_permission_overrides o where o.team_id=tm.team_id and o.member_id=tm.id and o.permission=p_permission),
    (select o.allowed from public.team_permission_overrides o where o.team_id=tm.team_id and o.role=tm.role and o.permission=p_permission)) end
  from public.team_members tm where tm.team_id=p_team and tm.profile_id=auth.uid() and tm.status='active';
$$;
create function private.has_team_permission(p_team uuid,p_permission text) returns boolean
language sql stable security definer set search_path='' as $$
  select private.is_approved_member(p_team) and coalesce(private.permission_override_value(p_team,p_permission),
    private.has_team_role(p_team,array['owner']::public.team_role[]) or
    case p_permission
      when 'team.manage' then false
      when 'members.manage' then private.has_team_role(p_team,array['admin']::public.team_role[])
      when 'events.manage' then private.has_team_role(p_team,array['admin','pastor','worship_leader']::public.team_role[])
      when 'setlists.manage' then private.has_team_role(p_team,array['admin','worship_leader','band_leader']::public.team_role[])
      when 'songs.create' then true
      when 'songs.edit' then private.has_team_role(p_team,array['admin']::public.team_role[])
      when 'files.upload' then private.has_team_role(p_team,array['admin','worship_leader','band_leader','band_member','dancer','media']::public.team_role[])
      else false end or exists(select 1 from public.team_members tm join public.custom_roles cr on cr.id=tm.custom_role_id and cr.team_id=tm.team_id
        where tm.team_id=p_team and tm.profile_id=auth.uid() and tm.status='active' and p_permission<>'songs.edit' and p_permission=any(cr.permissions)));
$$;
revoke all on function private.permission_override_value(uuid,text),private.has_team_permission(uuid,text) from public,anon;
grant execute on function private.permission_override_value(uuid,text),private.has_team_permission(uuid,text) to authenticated;
create or replace function private.has_workspace_permission(p_team_id uuid,p_permission text) returns boolean
language sql stable security definer set search_path='' as $$
  select p_permission in ('events.manage','setlists.manage') and private.has_team_permission(p_team_id,p_permission);
$$;

create function public.set_team_permission_override(p_team_id uuid,p_role text,p_member_id uuid,p_permission text,p_allowed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare target_member public.team_members%rowtype;
begin
  -- Serialize permission edits against membership/ownership changes.
  perform 1 from public.team_members where team_id=p_team_id order by id for update;
  if auth.uid() is null or not exists(select 1 from public.team_members tm join public.teams t on t.id=tm.team_id and t.owner_id=tm.profile_id
    where tm.team_id=p_team_id and tm.profile_id=auth.uid() and tm.status='active' and tm.role='owner') then
    raise exception 'Only the current owner can edit permissions' using errcode='42501'; end if;
  if p_permission is null or p_permission not in ('setlists.manage','songs.create','songs.edit','files.upload','members.manage','events.manage','team.manage')
    or (p_role is null)=(p_member_id is null) then raise exception 'Invalid permission target' using errcode='22023'; end if;
  if p_role is not null then
    if p_role='owner' then raise exception 'Owner permissions are protected' using errcode='42501'; end if;
    perform p_role::public.team_role;
  else
    select * into target_member from public.team_members where id=p_member_id and team_id=p_team_id and status='active';
    if not found or target_member.role='owner' then raise exception 'Choose a non-owner active member of this team' using errcode='42501'; end if;
  end if;
  delete from public.team_permission_overrides where team_id=p_team_id and permission=p_permission
    and (role::text=p_role or member_id=p_member_id);
  if p_allowed is not null then
    insert into public.team_permission_overrides(team_id,role,member_id,permission,allowed)
      values(p_team_id,p_role::public.team_role,p_member_id,p_permission,p_allowed);
  end if;
  insert into public.activity_logs(team_id,profile_id,action,target_type,target_id,details)
    values(p_team_id,auth.uid(),'changed permission','permission',coalesce(p_member_id,p_team_id),
      jsonb_build_object('permission',p_permission,'role',p_role,'member_id',p_member_id,'allowed',p_allowed));
end;
$$;
revoke all on function public.set_team_permission_override(uuid,text,uuid,text,boolean) from public,anon;
grant execute on function public.set_team_permission_override(uuid,text,uuid,text,boolean) to authenticated;

-- Workspace DML remains RPC-only. Triggers also cover SECURITY DEFINER RPCs and
-- shared edit approvals; RLS alone does not constrain those entry points.
create function private.enforce_permission_override() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; previous_data jsonb; target_team uuid; required_permission text;
begin
  if auth.uid() is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_data:=case when tg_op='INSERT' then null else to_jsonb(old) end;
  target_team:=(row_data->>'team_id')::uuid;
  required_permission:=tg_argv[0];
  if tg_table_name='teams' then
    target_team:=(row_data->>'id')::uuid;
    if new.owner_id is distinct from old.owner_id and coalesce(current_setting('app.transfer_team_ownership',true),'')<>'on' then
      raise exception 'Ownership must use the ownership transfer workflow' using errcode='42501'; end if;
    -- Changing owner during the existing guarded transfer is not a settings edit.
    if coalesce(current_setting('app.transfer_team_ownership',true),'')='on' then return new; end if;
    required_permission:=case when new.code is distinct from old.code then 'members.manage' else 'team.manage' end;
    if new.code is distinct from old.code and not private.has_team_permission(target_team,'members.manage') then
      raise exception 'Member management permission required to change the team code' using errcode='42501'; end if;
    if (to_jsonb(new)-array['code','updated_at','sync_revision']) is distinct from (to_jsonb(old)-array['code','updated_at','sync_revision'])
      and not private.has_team_permission(target_team,'team.manage') then raise exception 'Team settings permission required' using errcode='42501'; end if;
  elsif tg_table_name='setlist_songs' then select team_id into target_team from public.setlists where id=(row_data->>'setlist_id')::uuid;
  elsif tg_table_name='event_assignments' then select team_id into target_team from public.events where id=(row_data->>'event_id')::uuid;
  elsif tg_table_name='songs' then
    required_permission:=case when tg_op='INSERT' then 'songs.create' else 'songs.edit' end;
    -- Preserve separate deletion authority; permission overrides do not grant song deletion.
    if tg_op='DELETE' or (previous_data is not null and row_data->'deleted_at' is distinct from previous_data->'deleted_at') then
      if private.permission_override_value(target_team,'songs.edit') is false then raise exception 'Song editing is denied' using errcode='42501'; end if;
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
  elsif tg_table_name='practice_files' then
    if split_part(row_data->>'storage_path','/',1)<>target_team::text then raise exception 'File path must belong to its team' using errcode='42501'; end if;
    if tg_op='UPDATE' and (new.team_id<>old.team_id or new.uploaded_by<>old.uploaded_by) then raise exception 'File identity cannot change' using errcode='42501'; end if;
  elsif tg_table_name='team_members' then
    if tg_op='INSERT' and new.role='owner' and new.status='active' and new.profile_id=auth.uid()
      and new.custom_role_id is null and exists(select 1 from public.teams t where t.id=new.team_id and t.owner_id=auth.uid())
      and not exists(select 1 from public.team_members tm where tm.team_id=new.team_id) then return new; end if;
    if tg_op='DELETE' and old.profile_id=auth.uid() and old.role<>'owner' then return old; end if;
    if tg_op='UPDATE' and (new.team_id<>old.team_id or new.profile_id<>old.profile_id) then raise exception 'Member identity cannot change' using errcode='42501'; end if;
    if not private.has_team_role(target_team,array['owner','admin']::public.team_role[]) then
      if tg_op='INSERT' and (new.role<>'member' or new.custom_role_id is not null)
        or tg_op='UPDATE' and (old.role in ('owner','admin') or new.role is distinct from old.role or new.custom_role_id is distinct from old.custom_role_id)
        or tg_op='DELETE' and old.role in ('owner','admin') then
        raise exception 'Role assignment and privileged members require owner or admin authority' using errcode='42501';
      end if;
    end if;
  elsif tg_table_name='team_invitations' then
    if not private.has_team_role(target_team,array['owner','admin']::public.team_role[])
      and (row_data->>'role'<>'member' or previous_data->>'role'<>'member') then
      raise exception 'Privileged invitations require owner or admin authority' using errcode='42501';
    end if;
  end if;
  -- An absent override retains prior creator and request workflows. An explicit
  -- deny must reject every write, including writes routed through definer RPCs.
  if private.permission_override_value(target_team,required_permission) is false then
    raise exception 'This team permission is denied' using errcode='42501'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.enforce_permission_override() from public,anon,authenticated;
create trigger permission_override_guard before update on public.teams for each row execute function private.enforce_permission_override('team.manage');
create trigger permission_override_guard before insert or update or delete on public.team_settings for each row execute function private.enforce_permission_override('team.manage');
create trigger permission_override_guard before insert or update or delete on public.team_members for each row execute function private.enforce_permission_override('members.manage');
create trigger permission_override_guard before insert or update or delete on public.team_invitations for each row execute function private.enforce_permission_override('members.manage');
create trigger permission_override_guard before insert or update or delete on public.events for each row execute function private.enforce_permission_override('events.manage');
create trigger permission_override_guard before insert or update or delete on public.event_assignments for each row execute function private.enforce_permission_override('events.manage');
create trigger permission_override_guard before insert or update or delete on public.setlists for each row execute function private.enforce_permission_override('setlists.manage');
create trigger permission_override_guard before insert or update or delete on public.setlist_songs for each row execute function private.enforce_permission_override('setlists.manage');
create trigger permission_override_guard before insert or update or delete on public.songs for each row execute function private.enforce_permission_override('songs.edit');
create trigger permission_override_guard before insert or update or delete on public.practice_files for each row execute function private.enforce_permission_override('files.upload');

-- Delegated management uses existing row constraints and guarded RPC workflows.
create policy "Delegated members update roster" on public.team_members for update to authenticated
  using(private.has_team_permission(team_id,'members.manage')) with check(private.has_team_permission(team_id,'members.manage'));
create policy "Delegated members add non-owner roster" on public.team_members for insert to authenticated
  with check(role<>'owner' and private.has_team_permission(team_id,'members.manage'));
create policy "Delegated members remove non-owner roster" on public.team_members for delete to authenticated
  using(role<>'owner' and private.has_team_permission(team_id,'members.manage'));
create policy "Delegated settings update team" on public.teams for update to authenticated
  using(private.has_team_permission(id,'team.manage') or private.has_team_permission(id,'members.manage'))
  with check(private.has_team_permission(id,'team.manage') or private.has_team_permission(id,'members.manage'));
create policy "Delegated settings manage defaults" on public.team_settings for all to authenticated
  using(private.has_team_permission(team_id,'team.manage')) with check(private.has_team_permission(team_id,'team.manage'));
create policy "Effective settings permission constrains creation" on public.team_settings as restrictive for insert to authenticated
  with check(private.has_team_permission(team_id,'team.manage'));
create policy "Effective settings permission constrains updates" on public.team_settings as restrictive for update to authenticated
  using(private.has_team_permission(team_id,'team.manage')) with check(private.has_team_permission(team_id,'team.manage'));
create policy "Effective settings permission constrains deletion" on public.team_settings as restrictive for delete to authenticated
  using(private.has_team_permission(team_id,'team.manage'));
create policy "Delegated members manage invitations" on public.team_invitations for all to authenticated
  using(private.has_team_permission(team_id,'members.manage')) with check(private.has_team_permission(team_id,'members.manage'));
create policy "Delegated editors update songs" on public.songs for update to authenticated
  using(private.has_team_permission(team_id,'songs.edit')) with check(private.has_team_permission(team_id,'songs.edit'));

-- Preserve song identity, creator defaults, soft-deletion rules, and owner/admin
-- review authority. Only published content editing can be delegated here.
create or replace function private.guard_song_identity_content() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if auth.uid() is not null and (not private.is_approved_member(new.team_id) or new.created_by<>auth.uid() or new.status<>'approved' or new.deleted_at is not null) then raise exception 'Song identity must match its active creator' using errcode='42501'; end if;
  return new;
 end if;
 if new.id<>old.id or new.team_id<>old.team_id or new.created_by<>old.created_by or new.status<>old.status
 or new.created_at<>old.created_at or new.seed_source is distinct from old.seed_source then raise exception 'Protected song identity cannot change' using errcode='42501'; end if;
 if auth.uid() is null then return new; end if;
 if not private.is_approved_member(old.team_id) then raise exception 'Active team membership required' using errcode='42501'; end if;
 if new.deleted_at is distinct from old.deleted_at then
  if not private.has_team_role(old.team_id,array['owner','admin','worship_leader']::public.team_role[])
   or (to_jsonb(new)-array['deleted_at','updated_at','sync_revision']) is distinct from (to_jsonb(old)-array['deleted_at','updated_at','sync_revision']) then raise exception 'Deletion authority cannot edit song content' using errcode='42501'; end if;
 elsif private.permission_override_value(old.team_id,'songs.edit') is false then raise exception 'Song editing is denied' using errcode='42501';
 elsif old.created_by<>auth.uid() and not private.has_team_permission(old.team_id,'songs.edit') then
  raise exception 'Submit a song edit request for owner/admin approval' using errcode='42501';
 elsif old.deleted_at is not null then raise exception 'Restore the song before editing' using errcode='42501'; end if;
 return new;
end;
$$;

-- Content approval for workspace targets consumes the same persisted overrides.
create function private.can_review_shared_edit_before_permission_overrides(p_team uuid,p_type text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_approved_member(p_team) and case when p_type='song' then private.has_team_role(p_team,array['owner','admin']::public.team_role[])
 else private.has_workspace_permission(p_team,private.shared_edit_permission(p_type)) or
 private.has_team_role(p_team,case private.shared_edit_permission(p_type) when 'announcements.create' then array['owner','admin','pastor','worship_leader']::public.team_role[]
 when 'members.manage' then array['owner','admin']::public.team_role[] when 'dance_notes.review' then array['owner','admin']::public.team_role[] else '{}'::public.team_role[] end)
 or exists (select 1 from public.team_members tm join public.custom_roles cr on cr.id=tm.custom_role_id and cr.team_id=tm.team_id
 where tm.team_id=p_team and tm.profile_id=auth.uid() and tm.status='active' and private.shared_edit_permission(p_type)=any(cr.permissions)) end;
$$;
revoke all on function private.can_review_shared_edit_before_permission_overrides(uuid,text) from public,anon,authenticated;
create or replace function private.can_review_shared_edit(p_team uuid,p_type text) returns boolean language sql stable security definer set search_path='' as $$
  select case when private.shared_edit_permission(p_type) in ('events.manage','setlists.manage','members.manage')
    then private.has_team_permission(p_team,private.shared_edit_permission(p_type))
    else private.can_review_shared_edit_before_permission_overrides(p_team,p_type) end;
$$;
revoke all on function private.can_review_shared_edit(uuid,text) from public,anon,authenticated;

-- Storage checks run independently of practice_files metadata and preserve
-- existing bucket/path checks. Denials cannot be bypassed with direct uploads.
create policy "Permission overrides constrain practice uploads" on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'practice-files' or private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'));
create policy "Permission overrides constrain presentation uploads" on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'presentation-media' or private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'));
create policy "Effective permission constrains attachment creation" on public.practice_files as restrictive for insert to authenticated
  with check(private.has_team_permission(team_id,'files.upload'));
create policy "Effective permission constrains file deletion" on storage.objects as restrictive for delete to authenticated
  using(bucket_id not in ('practice-files','presentation-media') or private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'));

create index activity_logs_team_recent_idx on public.activity_logs(team_id,created_at desc);
-- Recovery: retain rows and remove overrides through the owner RPC (p_allowed
-- null). Do not drop historical migrations or bypass protected owner membership.

-- Permission-bearing custom roles can be changed only by the owner.
create policy "Owner inserts custom roles" on public.custom_roles as restrictive for insert to authenticated
  with check(private.has_team_role(team_id,array['owner']::public.team_role[]));
create policy "Owner updates custom roles" on public.custom_roles as restrictive for update to authenticated
  using(private.has_team_role(team_id,array['owner']::public.team_role[])) with check(private.has_team_role(team_id,array['owner']::public.team_role[]));
create policy "Owner deletes custom roles" on public.custom_roles as restrictive for delete to authenticated
  using(private.has_team_role(team_id,array['owner']::public.team_role[]));

create policy "Permission overrides constrain practice replacements" on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'practice-files' or private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'))
  with check(bucket_id<>'practice-files' or private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'));
create policy "Permission overrides constrain presentation replacements" on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'presentation-media' or private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'))
  with check(bucket_id<>'presentation-media' or private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'));

-- Delegated event managers retain the existing pending-review boundary.
create or replace function public.delete_event_cascade(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_team uuid;
  event_status text;
begin
  select team_id, approval_status
  into event_team, event_status
  from public.events
  where id = p_event_id
  for update;
  if event_team is null
     or not (
       private.has_team_role(event_team, array['owner', 'admin']::public.team_role[])
       or (
         event_status = 'approved'
         and private.has_workspace_permission(event_team,'events.manage')
       )
     ) then
    raise exception using errcode = '42501', message = 'event cannot be deleted';
  end if;
  delete from public.setlists where event_id = p_event_id and team_id = event_team;
  delete from public.events where id = p_event_id and team_id = event_team;
end;
$$;

-- Join-review delegation uses member management, preserving request identity.
create or replace function private.validate_join_request_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.team_id <> old.team_id
     or new.profile_id <> old.profile_id
     or new.requested_role <> old.requested_role then
    raise exception using errcode = '42501', message = 'join request identity and role are immutable';
  end if;
  if old.status <> 'pending' then
    raise exception using errcode = '42501', message = 'only pending join requests may be reviewed';
  end if;

  if new.status = 'canceled' then
    if old.profile_id <> auth.uid()
       or new.reviewed_by is not null
       or new.reviewed_at is not null then
      raise exception using errcode = '42501', message = 'invalid join request cancellation';
    end if;
  elsif new.status in ('approved', 'rejected') then
    if not private.has_team_permission(old.team_id,'members.manage')
       or new.reviewed_by is distinct from auth.uid()
       or new.reviewed_at is null then
      raise exception using errcode = '42501', message = 'invalid join request review';
    end if;
  else
    raise exception using errcode = '42501', message = 'invalid join request transition';
  end if;
  return new;
end;
$$;

-- Join-review delegation uses member management, preserving request identity.
create or replace function public.review_join_request(
  p_request_id uuid,
  p_decision text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.join_requests%rowtype;
  approved_member_id uuid;
  default_channel_id uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'invalid join request decision';
  end if;

  select *
  into request_row
  from public.join_requests
  where id = p_request_id
    and status = 'pending'
  for update;

  if request_row.id is null
     or not private.has_team_permission(request_row.team_id,'members.manage') then
    raise exception using errcode = '42501', message = 'join request cannot be reviewed';
  end if;
  if request_row.requested_role in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'privileged roles cannot be requested';
  end if;
  if p_decision='approved' and request_row.requested_role<>'member'
    and not private.has_team_role(request_row.team_id,array['owner','admin']::public.team_role[]) then
    raise exception using errcode='42501', message='Role assignment requires owner or admin authority';
  end if;

  if p_decision = 'approved' then
    insert into public.team_members (
      team_id, profile_id, role, status, ministry, custom_role_id
    )
    values (
      request_row.team_id,
      request_row.profile_id,
      request_row.requested_role,
      'active',
      initcap(replace(request_row.requested_role::text, '_', ' ')),
      null
    )
    on conflict (team_id, profile_id) do update
      set role = excluded.role,
          status = 'active',
          ministry = excluded.ministry,
          custom_role_id = null,
          updated_at = now()
    returning id into approved_member_id;

    select id
    into default_channel_id
    from public.message_channels
    where team_id = request_row.team_id
      and channel_type = 'team'
    order by created_at
    limit 1;

    if default_channel_id is not null then
      insert into public.message_channel_members (channel_id, team_member_id)
      values (default_channel_id, approved_member_id)
      on conflict (channel_id, team_member_id) do nothing;
    end if;
  end if;

  update public.join_requests
  set status = p_decision::public.join_request_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = request_row.id;

  return p_decision;
end;
$$;

create policy "Delegated managers read join requests" on public.join_requests for select to authenticated
  using(private.has_team_permission(team_id,'members.manage'));
create policy "Revoked managers cannot read others join requests" on public.join_requests as restrictive for select to authenticated
  using(profile_id=auth.uid() or private.has_team_permission(team_id,'members.manage'));
create policy "Delegated managers review pending join requests" on public.join_requests for update to authenticated
  using(status='pending' and private.has_team_permission(team_id,'members.manage'))
  with check(status in ('approved','rejected') and reviewed_by=auth.uid() and reviewed_at is not null and private.has_team_permission(team_id,'members.manage'));
create policy "Delegated managers read pending requester profiles" on public.profiles for select to authenticated
  using(exists(select 1 from public.join_requests jr where jr.profile_id=profiles.id and jr.status='pending' and private.has_team_permission(jr.team_id,'members.manage')));

-- The old practice bucket supports creation only. Explicit file-management
-- grants add replacement/deletion while retaining team paths and object reads.
create policy "Delegated file managers replace practice objects" on storage.objects for update to authenticated
  using(bucket_id='practice-files' and private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'))
  with check(bucket_id='practice-files' and private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'));
create policy "Delegated file managers remove practice objects" on storage.objects for delete to authenticated
  using(bucket_id='practice-files' and private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'));
create policy "Permission overrides constrain practice removal" on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'practice-files' or private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'));
create policy "Permission overrides constrain presentation removal" on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'presentation-media' or private.has_team_permission((storage.foldername(name))[1]::uuid,'files.upload'));
create policy "Delegated file managers update attachment metadata" on public.practice_files for update to authenticated
  using(private.has_team_permission(team_id,'files.upload')) with check(private.has_team_permission(team_id,'files.upload'));
create policy "Delegated file managers remove attachment metadata" on public.practice_files for delete to authenticated
  using(private.has_team_permission(team_id,'files.upload'));
