alter table public.announcements
add column if not exists priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
add column if not exists event_id uuid references public.events(id) on delete set null;

alter table public.notifications
add column if not exists acknowledged_at timestamptz,
add column if not exists priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
add column if not exists event_id uuid references public.events(id) on delete set null,
add column if not exists scheduled_for timestamptz not null default now(),
add column if not exists recurrence_rule text not null default 'none' check (recurrence_rule in ('none', 'weekly', 'monthly')),
add column if not exists recurrence_index integer not null default 0 check (recurrence_index >= 0),
add column if not exists recurrence_total integer not null default 1 check (recurrence_total >= 1),
add column if not exists notice_group_id uuid,
add column if not exists created_by uuid references public.profiles(id) on delete set null;

create table if not exists public.announcement_receipts (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  read_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

alter table public.announcement_receipts enable row level security;

drop trigger if exists announcement_receipts_touch_updated_at on public.announcement_receipts;
create trigger announcement_receipts_touch_updated_at
before update on public.announcement_receipts
for each row execute function public.touch_updated_at();

create index if not exists announcement_receipts_team_announcement_idx
on public.announcement_receipts (team_id, announcement_id);

create index if not exists announcement_receipts_profile_ack_idx
on public.announcement_receipts (profile_id, acknowledged_at);

create index if not exists announcements_team_priority_idx
on public.announcements (team_id, priority, created_at desc);

create index if not exists notifications_profile_scheduled_read_idx
on public.notifications (profile_id, scheduled_for, read_at);

create index if not exists notifications_team_group_scheduled_idx
on public.notifications (team_id, notice_group_id, scheduled_for desc);

drop policy if exists "Members can read own announcement receipts" on public.announcement_receipts;
drop policy if exists "Owners and admins can read announcement receipts" on public.announcement_receipts;
drop policy if exists "Members can create own announcement receipts" on public.announcement_receipts;
drop policy if exists "Owners and admins can create announcement receipts" on public.announcement_receipts;
drop policy if exists "Members can acknowledge own announcement receipts" on public.announcement_receipts;
drop policy if exists "Owners and admins can read team notifications" on public.notifications;

create policy "Members can read own announcement receipts"
on public.announcement_receipts for select to authenticated
using (profile_id = (select auth.uid()));

create policy "Owners and admins can read announcement receipts"
on public.announcement_receipts for select to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

create policy "Members can create own announcement receipts"
on public.announcement_receipts for insert to authenticated
with check (
  profile_id = (select auth.uid())
  and private.is_approved_member(team_id)
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_receipts.announcement_id
      and a.team_id = announcement_receipts.team_id
  )
);

create policy "Owners and admins can create announcement receipts"
on public.announcement_receipts for insert to authenticated
with check (
  private.has_team_role(team_id, array['owner','admin']::public.team_role[])
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_receipts.announcement_id
      and a.team_id = announcement_receipts.team_id
  )
);

create policy "Members can acknowledge own announcement receipts"
on public.announcement_receipts for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "Owners and admins can read team notifications"
on public.notifications for select to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));
