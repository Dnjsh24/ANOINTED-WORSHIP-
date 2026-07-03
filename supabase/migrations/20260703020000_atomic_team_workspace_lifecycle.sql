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
security definer
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
  on conflict (team_id, name) do nothing;

  team_id := v_team_id;
  team_member_id := v_team_member_id;
  channel_id := v_channel_id;
  return next;
end;
$$;

revoke all on function public.create_team_workspace(text, text, text, time, time) from public, anon;
grant execute on function public.create_team_workspace(text, text, text, time, time) to authenticated;

create or replace function public.delete_team_workspace(p_team_id uuid)
returns void
language plpgsql
security definer
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

delete from public.teams t
where not exists (
  select 1
  from public.team_members tm
  where tm.team_id = t.id
);
