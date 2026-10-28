-- DRAFT. Separate shared request/management permission compatibility repair.
-- /events/new authorizes effective events.manage OR events.request. Explicit
-- events.manage denial must still allow a valid independent pending request,
-- without allowing published events, live assignments, or existing-row edits.
-- No hosted application. Fix forward; never disable permission guards.
begin;
create or replace function private.enforce_permission_override() returns trigger
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
  elsif tg_table_name='events' and tg_op='INSERT'
    and row_data->>'approval_status'='pending' and row_data->>'created_by'=auth.uid()::text and row_data->>'deleted_at' is null
    and private.can_create_event_workspace(target_team) then
    -- A denied management grant does not revoke an independent request grant.
    -- Only a new caller-owned pending proposal is admitted. Published rows,
    -- all existing-row edits/deletes and live assignments keep the old guards.
    return new;
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
commit;
