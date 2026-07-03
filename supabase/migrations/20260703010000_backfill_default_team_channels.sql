with existing_team_channels as (
  select distinct on (team_id)
    id,
    team_id
  from public.message_channels
  where channel_type = 'team'
  order by team_id, created_at, id
),
inserted_team_channels as (
  insert into public.message_channels (team_id, name, channel_type, created_by)
  select
    t.id,
    'Worship Team',
    'team',
    t.owner_id
  from public.teams t
  where not exists (
    select 1
    from existing_team_channels c
    where c.team_id = t.id
  )
  returning id, team_id
),
team_channels as (
  select id, team_id from existing_team_channels
  union all
  select id, team_id from inserted_team_channels
)
insert into public.message_channel_members (channel_id, team_member_id)
select
  c.id,
  tm.id
from team_channels c
join public.team_members tm
  on tm.team_id = c.team_id
  and tm.status = 'active'
on conflict (channel_id, team_member_id) do nothing;
