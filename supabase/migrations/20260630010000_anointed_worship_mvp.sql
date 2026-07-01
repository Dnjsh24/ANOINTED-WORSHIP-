create extension if not exists pgcrypto;

create schema if not exists private;

create type public.team_role as enum (
  'owner',
  'admin',
  'pastor',
  'worship_leader',
  'band_leader',
  'band_member',
  'dancer',
  'media',
  'member'
);

create type public.member_status as enum ('active', 'inactive');
create type public.join_request_status as enum ('pending', 'approved', 'rejected');
create type public.attendance_status as enum ('available', 'maybe', 'unavailable', 'pending');
create type public.event_type as enum ('service', 'rehearsal', 'meeting', 'special_event');
create type public.song_edit_status as enum ('pending', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  code text not null unique check (code ~ '^[A-Z]{2,3}-[0-9]{5}$'),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.team_role not null default 'member',
  status public.member_status not null default 'active',
  ministry text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, profile_id)
);

create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  requested_role public.team_role not null default 'member',
  status public.join_request_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, profile_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  type public.event_type not null,
  name text not null,
  event_date date not null,
  starts_at time not null,
  ends_at time,
  location text,
  description text,
  call_time time,
  rehearsal_time time,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  assignment text not null,
  created_at timestamptz not null default now(),
  unique (event_id, team_member_id, assignment)
);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null,
  artist text not null,
  original_key text not null,
  bpm integer not null check (bpm between 40 and 240),
  time_signature text not null default '4/4',
  lyrics_chords text not null,
  nashville_numbers text,
  youtube_url text,
  spotify_url text,
  tags text[] not null default '{}',
  status song_edit_status not null default 'approved',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.song_versions (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  version_number integer not null,
  lyrics_chords text not null,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  change_note text,
  created_at timestamptz not null default now(),
  unique (song_id, version_number)
);

create table public.song_edit_requests (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  proposed_title text,
  proposed_artist text,
  proposed_key text,
  proposed_bpm integer,
  proposed_lyrics_chords text,
  status public.song_edit_status not null default 'pending',
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.setlists (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  name text not null,
  setlist_date date not null,
  location text,
  call_time time,
  rehearsal_time time,
  service_times text[] not null default '{}',
  leader_member_id uuid references public.team_members(id) on delete set null,
  notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.setlist_songs (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references public.setlists(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete restrict,
  song_order integer not null check (song_order > 0),
  assigned_key text not null,
  lead_member_id uuid references public.team_members(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  unique (setlist_id, song_order)
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  status public.attendance_status not null default 'pending',
  note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, team_member_id)
);

create table public.monthly_schedules (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  schedule_month date not null,
  title text not null,
  schedule jsonb not null default '[]'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dance_notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  song_id uuid references public.songs(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  title text not null,
  choreography_notes text,
  formation_notes text,
  outfit_notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.practice_files (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  song_id uuid references public.songs(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  visibility text not null default 'team' check (visibility in ('admins', 'team', 'specific_members')),
  title text not null,
  body text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.message_channels (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  channel_type text not null default 'team' check (channel_type in ('team', 'group', 'direct')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.message_channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.message_channels(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (channel_id, team_member_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.message_channels(id) on delete cascade,
  sender_member_id uuid not null references public.team_members(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 2000),
  attachment_file_id uuid references public.practice_files(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function private.is_approved_member(target_team_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = target_team_id
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
  );
$$;

create or replace function private.has_team_role(target_team_id uuid, allowed_roles public.team_role[])
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = target_team_id
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
      and tm.role = any(allowed_roles)
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'teams', 'team_members', 'join_requests', 'announcements', 'events',
    'event_assignments', 'songs', 'song_versions', 'song_edit_requests', 'setlists',
    'setlist_songs', 'attendance', 'monthly_schedules', 'dance_notes', 'practice_files',
    'prayer_requests', 'message_channels', 'message_channel_members', 'messages', 'notifications'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger teams_touch_updated_at before update on public.teams for each row execute function public.touch_updated_at();
create trigger team_members_touch_updated_at before update on public.team_members for each row execute function public.touch_updated_at();
create trigger join_requests_touch_updated_at before update on public.join_requests for each row execute function public.touch_updated_at();
create trigger announcements_touch_updated_at before update on public.announcements for each row execute function public.touch_updated_at();
create trigger events_touch_updated_at before update on public.events for each row execute function public.touch_updated_at();
create trigger songs_touch_updated_at before update on public.songs for each row execute function public.touch_updated_at();
create trigger song_edit_requests_touch_updated_at before update on public.song_edit_requests for each row execute function public.touch_updated_at();
create trigger setlists_touch_updated_at before update on public.setlists for each row execute function public.touch_updated_at();
create trigger attendance_touch_updated_at before update on public.attendance for each row execute function public.touch_updated_at();
create trigger monthly_schedules_touch_updated_at before update on public.monthly_schedules for each row execute function public.touch_updated_at();
create trigger dance_notes_touch_updated_at before update on public.dance_notes for each row execute function public.touch_updated_at();
create trigger prayer_requests_touch_updated_at before update on public.prayer_requests for each row execute function public.touch_updated_at();
create trigger message_channels_touch_updated_at before update on public.message_channels for each row execute function public.touch_updated_at();
create trigger messages_touch_updated_at before update on public.messages for each row execute function public.touch_updated_at();

create index profiles_email_idx on public.profiles (email);
create index teams_owner_id_idx on public.teams (owner_id);
create index team_members_profile_id_idx on public.team_members (profile_id);
create index team_members_team_profile_idx on public.team_members (team_id, profile_id);
create index join_requests_team_status_idx on public.join_requests (team_id, status);
create index announcements_team_created_idx on public.announcements (team_id, created_at desc);
create index events_team_date_idx on public.events (team_id, event_date);
create index songs_team_title_idx on public.songs (team_id, title);
create index setlists_team_date_idx on public.setlists (team_id, setlist_date);
create index attendance_event_member_idx on public.attendance (event_id, team_member_id);
create index practice_files_team_idx on public.practice_files (team_id);
create index messages_channel_created_idx on public.messages (channel_id, created_at);
create index notifications_profile_read_idx on public.notifications (profile_id, read_at);

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on all tables in schema public to authenticated;

create policy "Users can view their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Authenticated users can create their profile"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy "Members can view their teams"
on public.teams for select to authenticated
using (private.is_approved_member(id));

create policy "Authenticated users can create teams they own"
on public.teams for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "Owners and admins can update teams"
on public.teams for update to authenticated
using (private.has_team_role(id, array['owner','admin']::public.team_role[]))
with check (private.has_team_role(id, array['owner','admin']::public.team_role[]));

create policy "Members can view team member rows"
on public.team_members for select to authenticated
using (private.is_approved_member(team_id));

create policy "Owners can add themselves as first member"
on public.team_members for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (select 1 from public.teams t where t.id = team_id and t.owner_id = (select auth.uid()))
);

create policy "Admins can manage team members"
on public.team_members for update to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

create policy "Users can submit join requests"
on public.join_requests for insert to authenticated
with check (profile_id = (select auth.uid()));

create policy "Users and admins can view join requests"
on public.join_requests for select to authenticated
using (profile_id = (select auth.uid()) or private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

create policy "Admins can review join requests"
on public.join_requests for update to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

create policy "Members can read announcements"
on public.announcements for select to authenticated
using (private.is_approved_member(team_id));

create policy "Leaders can create announcements"
on public.announcements for insert to authenticated
with check (private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[]));

create policy "Members can read events"
on public.events for select to authenticated
using (private.is_approved_member(team_id));

create policy "Leaders can manage events"
on public.events for all to authenticated
using (private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[]));

create policy "Members can read songs"
on public.songs for select to authenticated
using (private.is_approved_member(team_id) and status = 'approved');

create policy "Members can propose songs"
on public.songs for insert to authenticated
with check (private.is_approved_member(team_id) and created_by = (select auth.uid()));

create policy "Song reviewers can update songs"
on public.songs for update to authenticated
using (private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[]));

create policy "Members can read song versions"
on public.song_versions for select to authenticated
using (exists (
  select 1 from public.songs s
  where s.id = song_id and private.is_approved_member(s.team_id)
));

create policy "Members can submit song edits"
on public.song_edit_requests for insert to authenticated
with check (submitted_by = (select auth.uid()));

create policy "Song reviewers can view and review edits"
on public.song_edit_requests for all to authenticated
using (exists (
  select 1 from public.songs s
  where s.id = song_id
    and private.has_team_role(s.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
))
with check (exists (
  select 1 from public.songs s
  where s.id = song_id
    and private.has_team_role(s.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
));

create policy "Members can read setlists"
on public.setlists for select to authenticated
using (private.is_approved_member(team_id));

create policy "Leaders can manage setlists"
on public.setlists for all to authenticated
using (private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[]));

create policy "Members can read setlist songs"
on public.setlist_songs for select to authenticated
using (exists (
  select 1 from public.setlists sl
  where sl.id = setlist_id and private.is_approved_member(sl.team_id)
));

create policy "Leaders can manage setlist songs"
on public.setlist_songs for all to authenticated
using (exists (
  select 1 from public.setlists sl
  where sl.id = setlist_id
    and private.has_team_role(sl.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
))
with check (exists (
  select 1 from public.setlists sl
  where sl.id = setlist_id
    and private.has_team_role(sl.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
));

create policy "Members can read event assignments"
on public.event_assignments for select to authenticated
using (exists (
  select 1 from public.events e
  where e.id = event_id and private.is_approved_member(e.team_id)
));

create policy "Members can read attendance"
on public.attendance for select to authenticated
using (exists (
  select 1 from public.events e
  where e.id = event_id and private.is_approved_member(e.team_id)
));

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

create policy "Members can read monthly schedules"
on public.monthly_schedules for select to authenticated
using (private.is_approved_member(team_id));

create policy "Leaders can manage monthly schedules"
on public.monthly_schedules for all to authenticated
using (private.has_team_role(team_id, array['owner','admin','worship_leader']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin','worship_leader']::public.team_role[]));

create policy "Members can read dance notes"
on public.dance_notes for select to authenticated
using (private.is_approved_member(team_id));

create policy "Dancers and leaders can manage dance notes"
on public.dance_notes for all to authenticated
using (private.has_team_role(team_id, array['owner','admin','worship_leader','dancer']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin','worship_leader','dancer']::public.team_role[]));

create policy "Members can read practice files"
on public.practice_files for select to authenticated
using (private.is_approved_member(team_id));

create policy "Members can upload practice files"
on public.practice_files for insert to authenticated
with check (private.is_approved_member(team_id) and uploaded_by = (select auth.uid()));

create policy "Members can read prayer requests"
on public.prayer_requests for select to authenticated
using (
  private.is_approved_member(team_id)
  and (
    visibility = 'team'
    or created_by = (select auth.uid())
    or private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[])
  )
);

create policy "Members can create prayer requests"
on public.prayer_requests for insert to authenticated
with check (private.is_approved_member(team_id) and created_by = (select auth.uid()));

create policy "Members can read channels"
on public.message_channels for select to authenticated
using (private.is_approved_member(team_id));

create policy "Leaders can create channels"
on public.message_channels for insert to authenticated
with check (private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[]));

create policy "Members can read channel membership"
on public.message_channel_members for select to authenticated
using (exists (
  select 1 from public.message_channels c
  where c.id = channel_id and private.is_approved_member(c.team_id)
));

create policy "Channel members can read messages"
on public.messages for select to authenticated
using (exists (
  select 1
  from public.message_channel_members mcm
  join public.team_members tm on tm.id = mcm.team_member_id
  where mcm.channel_id = messages.channel_id
    and tm.profile_id = (select auth.uid())
    and tm.status = 'active'
));

create policy "Channel members can send messages"
on public.messages for insert to authenticated
with check (exists (
  select 1
  from public.message_channel_members mcm
  join public.team_members tm on tm.id = mcm.team_member_id
  where mcm.channel_id = messages.channel_id
    and tm.id = messages.sender_member_id
    and tm.profile_id = (select auth.uid())
    and tm.status = 'active'
));

create policy "Users can read own notifications"
on public.notifications for select to authenticated
using (profile_id = (select auth.uid()));

create policy "Users can update own notifications"
on public.notifications for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'practice-files',
  'practice-files',
  false,
  15728640,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/mpeg',
    'audio/wav',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Members can read team practice objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'practice-files'
  and private.is_approved_member(((storage.foldername(name))[1])::uuid)
);

create policy "Members can upload team practice objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'practice-files'
  and private.is_approved_member(((storage.foldername(name))[1])::uuid)
);
