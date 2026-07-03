create table if not exists public.service_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  service_type text not null default 'Sunday Worship',
  location text not null default 'Main Sanctuary',
  call_time time not null default '08:00',
  rehearsal_time time not null default '08:30',
  reminder_frequency text not null default 'weekly' check (reminder_frequency in ('none', 'weekly', 'monthly')),
  reminder_occurrences integer not null default 4 check (reminder_occurrences between 1 and 12),
  default_roles jsonb not null default '{
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
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, name)
);

create table if not exists public.setlist_change_log (
  id uuid primary key default gen_random_uuid(),
  setlist_id uuid not null references public.setlists(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  changed_by uuid references public.profiles(id) on delete set null,
  change_type text not null check (change_type in ('created', 'updated', 'song_added', 'song_removed', 'song_reordered')),
  summary text not null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists service_templates_team_idx on public.service_templates(team_id);
create index if not exists setlist_change_log_setlist_created_idx on public.setlist_change_log(setlist_id, created_at desc);
create index if not exists setlist_change_log_team_created_idx on public.setlist_change_log(team_id, created_at desc);

drop trigger if exists service_templates_touch_updated_at on public.service_templates;
create trigger service_templates_touch_updated_at before update on public.service_templates for each row execute function public.touch_updated_at();

alter table public.service_templates enable row level security;
alter table public.setlist_change_log enable row level security;

drop policy if exists "Members can read service templates" on public.service_templates;
create policy "Members can read service templates"
on public.service_templates for select
using (private.is_approved_member(team_id));

drop policy if exists "Owners and admins can manage service templates" on public.service_templates;
create policy "Owners and admins can manage service templates"
on public.service_templates for all
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

drop policy if exists "Members can read setlist history" on public.setlist_change_log;
create policy "Members can read setlist history"
on public.setlist_change_log for select
using (private.is_approved_member(team_id));

drop policy if exists "Setlist managers can create setlist history" on public.setlist_change_log;
create policy "Setlist managers can create setlist history"
on public.setlist_change_log for insert
with check (private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[]));

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
select
  teams.id,
  'Sunday Morning Service',
  'Sunday Worship',
  'Main Sanctuary',
  '08:00',
  '08:30',
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
  teams.owner_id
from public.teams
on conflict (team_id, name) do nothing;
