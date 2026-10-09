-- Usage is an approximate count of distinct UTC minutes containing visible,
-- recent browser activity. No elapsed gaps or historical usage are inferred.
create unique index team_members_team_id_id_usage_idx on public.team_members (team_id, id);

create table public.member_usage_state (
  member_id uuid primary key,
  team_id uuid not null,
  last_seen_at timestamptz not null,
  last_credited_minute timestamptz not null,
  foreign key (team_id, member_id) references public.team_members(team_id, id) on delete cascade
);
create index member_usage_state_team_idx on public.member_usage_state (team_id);

create table public.member_usage_daily (
  member_id uuid not null,
  team_id uuid not null,
  usage_date date not null,
  active_minutes integer not null default 0 check (active_minutes between 0 and 1440),
  sessions integer not null default 0 check (sessions between 0 and 1440),
  primary key (member_id, usage_date),
  foreign key (team_id, member_id) references public.team_members(team_id, id) on delete cascade
);
create index member_usage_daily_team_date_idx on public.member_usage_daily (team_id, usage_date);

alter table public.member_usage_state enable row level security;
alter table public.member_usage_daily enable row level security;
revoke all on public.member_usage_state, public.member_usage_daily from public, anon, authenticated;
grant select on public.member_usage_state, public.member_usage_daily to authenticated;

create policy "Owners and admins read team usage state" on public.member_usage_state
for select to authenticated
using (private.has_team_role(team_id, array['owner', 'admin']::public.team_role[]));
create policy "Owners and admins read team usage daily" on public.member_usage_daily
for select to authenticated
using (private.has_team_role(team_id, array['owner', 'admin']::public.team_role[]));

create function public.record_member_usage(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_now timestamptz;
  v_minute timestamptz;
  v_previous public.member_usage_state%rowtype;
  v_new_session integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Serialize all tabs/devices for this member. Never accept a client member,
  -- timestamp, duration, or session counter as an accounting authority.
  select tm.id into v_member_id from public.team_members tm
  where tm.team_id = p_team_id and tm.profile_id = auth.uid() and tm.status = 'active'
  for update;
  if v_member_id is null then
    raise exception 'Active team membership required' using errcode = '42501';
  end if;
  v_now := clock_timestamp();
  v_minute := date_trunc('minute', v_now at time zone 'UTC') at time zone 'UTC';
  select * into v_previous from public.member_usage_state where member_id = v_member_id;
  v_new_session := case when v_previous.member_id is null
    or v_now - v_previous.last_seen_at >= interval '5 minutes' then 1 else 0 end;

  if v_previous.member_id is null or v_minute > v_previous.last_credited_minute then
    insert into public.member_usage_daily (member_id, team_id, usage_date, active_minutes, sessions)
    values (v_member_id, p_team_id, (v_now at time zone 'UTC')::date, 1, v_new_session)
    on conflict (member_id, usage_date) do update
    set active_minutes = public.member_usage_daily.active_minutes + 1,
        sessions = public.member_usage_daily.sessions + excluded.sessions;
  end if;
  insert into public.member_usage_state (member_id, team_id, last_seen_at, last_credited_minute)
  values (v_member_id, p_team_id, v_now, v_minute)
  on conflict (member_id) do update
  set last_seen_at = excluded.last_seen_at,
      last_credited_minute = greatest(public.member_usage_state.last_credited_minute, excluded.last_credited_minute);
end;
$$;
revoke all on function public.record_member_usage(uuid) from public, anon, authenticated;
grant execute on function public.record_member_usage(uuid) to authenticated;
