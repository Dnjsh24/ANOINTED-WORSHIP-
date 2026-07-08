-- Move notify_join_request_canceled to private schema to avoid exposing it to the API
create schema if not exists private;

create or replace function private.notify_join_request_canceled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_name text;
begin
  if old.status::text = 'pending' and new.status::text = 'canceled' then
    select coalesce(nullif(p.full_name, ''), p.email, 'A member')
    into requester_name
    from public.profiles p
    where p.id = new.profile_id;

    insert into public.notifications (
      team_id,
      profile_id,
      title,
      body,
      target_path,
      priority,
      target_label,
      created_by
    )
    select
      new.team_id,
      tm.profile_id,
      'Join request canceled',
      coalesce(requester_name, 'A member') || ' canceled their request to join your team.',
      '/members/requests',
      'normal',
      'Admins',
      new.profile_id
    from public.team_members tm
    where tm.team_id = new.team_id
      and tm.status = 'active'
      and tm.role in ('owner', 'admin')
      and tm.profile_id <> new.profile_id;
  end if;

  return new;
end;
$$;

drop trigger if exists join_requests_notify_canceled on public.join_requests;
create trigger join_requests_notify_canceled
after update of status on public.join_requests
for each row execute function private.notify_join_request_canceled();

drop function if exists public.notify_join_request_canceled();

-- Convert create_team_workspace to SECURITY INVOKER
create or replace function public.create_team_workspace(
  p_name text,
  p_code text,
  p_default_service_location text default 'Main Sanctuary',
  p_default_call_time time default '09:00',
  p_default_rehearsal_time time default '08:15'
)
returns table (
  team_id uuid,
  team_member_id uuid,
  channel_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid := pg_catalog.gen_random_uuid();
  v_team_member_id uuid;
  v_channel_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  insert into public.teams (id, name, code, owner_id)
  values (v_team_id, p_name, upper(trim(p_code)), v_user_id);

  insert into public.team_members (team_id, profile_id, role, status, ministry)
  values (v_team_id, v_user_id, 'owner', 'active', 'Worship Leader')
  returning id into v_team_member_id;

  insert into public.team_settings (
    team_id,
    default_service_location,
    default_call_time,
    default_rehearsal_time
  )
  values (
    v_team_id,
    coalesce(nullif(trim(p_default_service_location), ''), 'Main Sanctuary'),
    coalesce(p_default_call_time, '09:00'::time),
    coalesce(p_default_rehearsal_time, '08:15'::time)
  );

  insert into public.message_channels (team_id, name, channel_type, created_by)
  values (v_team_id, 'Worship Team', 'team', v_user_id)
  returning id into v_channel_id;

  insert into public.message_channel_members (channel_id, team_member_id)
  values (v_channel_id, v_team_member_id);

  insert into public.service_templates (
    team_id,
    name,
    service_type,
    location,
    call_time,
    rehearsal_time,
    reminder_frequency,
    reminder_occurrences,
    default_roles,
    created_by
  )
  values (
    v_team_id,
    'Sunday Morning Service',
    'Sunday Worship',
    coalesce(nullif(trim(p_default_service_location), ''), 'Main Sanctuary'),
    coalesce(p_default_call_time, '09:00'::time),
    coalesce(p_default_rehearsal_time, '08:15'::time),
    'weekly',
    4,
    '{
      "worshipLeader": "",
      "mainKeys": "",
      "secondKeys": "",
      "acousticGuitar": "",
      "electricGuitar": "",
      "bass": "",
      "drums": "",
      "extraBandMembers": [],
      "backupSingers": ["", ""],
      "media": "",
      "dancers": ["", "", ""]
    }'::jsonb,
    v_user_id
  )
  on conflict on constraint service_templates_team_id_name_key do nothing;

  team_id := v_team_id;
  team_member_id := v_team_member_id;
  channel_id := v_channel_id;
  return next;
end;
$$;

revoke all on function public.create_team_workspace(text, text, text, time, time) from public, anon;
grant execute on function public.create_team_workspace(text, text, text, time, time) to authenticated;

-- Add necessary delete policies for team deletion
drop policy if exists "Owners can delete their team" on public.teams;
create policy "Owners can delete their team"
on public.teams for delete to authenticated
using (private.has_team_role(id, array['owner']::public.team_role[]));

drop policy if exists "Owners can delete messages during team deletion" on public.messages;
create policy "Owners can delete messages during team deletion"
on public.messages for delete to authenticated
using (exists (
  select 1 from public.message_channels c 
  where c.id = channel_id and private.has_team_role(c.team_id, array['owner']::public.team_role[])
));

-- Convert delete_team_workspace to SECURITY INVOKER
create or replace function public.delete_team_workspace(p_team_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.team_members tm
    where tm.team_id = p_team_id
      and tm.profile_id = v_user_id
      and tm.status = 'active'
      and tm.role in ('owner', 'admin')
  ) then
    raise exception 'Only owners and admins can delete this team' using errcode = '42501';
  end if;

  delete from public.messages m
  using public.message_channels c
  where m.channel_id = c.id
    and c.team_id = p_team_id;

  delete from public.setlist_songs ss
  using public.setlists sl
  where ss.setlist_id = sl.id
    and sl.team_id = p_team_id;

  delete from public.setlist_songs ss
  using public.songs s
  where ss.song_id = s.id
    and s.team_id = p_team_id;

  delete from public.teams
  where id = p_team_id;
end;
$$;

revoke all on function public.delete_team_workspace(uuid) from public, anon;
grant execute on function public.delete_team_workspace(uuid) to authenticated;
