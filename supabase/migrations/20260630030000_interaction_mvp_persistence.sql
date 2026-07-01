create table if not exists public.team_settings (
  team_id uuid primary key references public.teams(id) on delete cascade,
  notification_preferences text[] not null default array['pendingRequests','upcomingEvents','unreadMessages','attendanceReminders'],
  default_service_location text not null default 'Main Sanctuary',
  default_call_time time not null default '08:00',
  default_rehearsal_time time not null default '08:15',
  dashboard_widgets text[] not null default array['setlists','events','messages','songs','members'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.team_role not null default 'member',
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, email)
);

create table if not exists public.song_favorites (
  song_id uuid not null references public.songs(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (song_id, team_member_id)
);

alter table public.notifications
add column if not exists target_path text;

alter table public.message_channel_members
add column if not exists muted_at timestamptz;

alter table public.team_settings enable row level security;
alter table public.team_invitations enable row level security;
alter table public.song_favorites enable row level security;

drop trigger if exists team_settings_touch_updated_at on public.team_settings;
create trigger team_settings_touch_updated_at before update on public.team_settings for each row execute function public.touch_updated_at();

drop trigger if exists team_invitations_touch_updated_at on public.team_invitations;
create trigger team_invitations_touch_updated_at before update on public.team_invitations for each row execute function public.touch_updated_at();

create index if not exists team_invitations_team_status_idx on public.team_invitations (team_id, status);
create index if not exists song_favorites_team_member_idx on public.song_favorites (team_member_id);
create index if not exists message_channel_members_muted_idx on public.message_channel_members (muted_at);

create policy "Members can read team settings"
on public.team_settings for select to authenticated
using (private.is_approved_member(team_id));

create policy "Owners and admins can manage team settings"
on public.team_settings for all to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

create policy "Admins can read invitations"
on public.team_invitations for select to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

create policy "Admins can create invitations"
on public.team_invitations for insert to authenticated
with check (
  invited_by = (select auth.uid())
  and private.has_team_role(team_id, array['owner','admin']::public.team_role[])
);

create policy "Admins can update invitations"
on public.team_invitations for update to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

create policy "Members can read own song favorites"
on public.song_favorites for select to authenticated
using (exists (
  select 1
  from public.team_members tm
  where tm.id = team_member_id and tm.profile_id = (select auth.uid())
));

create policy "Members can create own song favorites"
on public.song_favorites for insert to authenticated
with check (exists (
  select 1
  from public.team_members tm
  join public.songs s on s.id = song_id
  where tm.id = team_member_id
    and tm.profile_id = (select auth.uid())
    and private.is_approved_member(s.team_id)
));

create policy "Members can delete own song favorites"
on public.song_favorites for delete to authenticated
using (exists (
  select 1
  from public.team_members tm
  where tm.id = team_member_id and tm.profile_id = (select auth.uid())
));

drop policy if exists "Members can confirm own attendance" on public.attendance;
create policy "Members can confirm own attendance"
on public.attendance for update to authenticated
using (exists (
  select 1 from public.team_members tm
  where tm.id = team_member_id and tm.profile_id = (select auth.uid())
))
with check (exists (
  select 1 from public.team_members tm
  where tm.id = team_member_id and tm.profile_id = (select auth.uid())
));

create policy "Members can create own attendance"
on public.attendance for insert to authenticated
with check (exists (
  select 1 from public.team_members tm
  where tm.id = team_member_id and tm.profile_id = (select auth.uid())
));

create policy "Channel members can update own membership"
on public.message_channel_members for update to authenticated
using (exists (
  select 1
  from public.team_members tm
  where tm.id = team_member_id and tm.profile_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.team_members tm
  where tm.id = team_member_id and tm.profile_id = (select auth.uid())
));

create policy "Channel members can leave channels"
on public.message_channel_members for delete to authenticated
using (exists (
  select 1
  from public.team_members tm
  where tm.id = team_member_id and tm.profile_id = (select auth.uid())
));
