alter table public.announcements
add column if not exists target_role public.team_role,
add column if not exists target_profile_id uuid references public.profiles(id) on delete cascade,
add column if not exists target_label text not null default 'All team';

alter table public.notifications
add column if not exists target_role public.team_role,
add column if not exists target_profile_id uuid references public.profiles(id) on delete cascade,
add column if not exists target_label text not null default 'All team';

create index if not exists announcements_team_target_role_idx
on public.announcements (team_id, target_role, created_at desc);

create index if not exists announcements_team_target_profile_idx
on public.announcements (team_id, target_profile_id, created_at desc);

create index if not exists notifications_team_target_role_idx
on public.notifications (team_id, target_role, created_at desc);

drop policy if exists "Members can read announcements" on public.announcements;
drop policy if exists "Leaders can create announcements" on public.announcements;
drop policy if exists "Targeted members can read announcements" on public.announcements;
drop policy if exists "Owners and admins can create announcements" on public.announcements;
drop policy if exists "Owners and admins can create notifications" on public.notifications;

create policy "Targeted members can read announcements"
on public.announcements for select to authenticated
using (
  private.is_approved_member(team_id)
  and (
    (target_role is null and target_profile_id is null)
    or target_profile_id = (select auth.uid())
    or private.has_team_role(team_id, array['owner','admin']::public.team_role[])
    or exists (
      select 1
      from public.team_members tm
      where tm.team_id = announcements.team_id
        and tm.profile_id = (select auth.uid())
        and tm.status = 'active'
        and tm.role = announcements.target_role
    )
  )
);

create policy "Owners and admins can create announcements"
on public.announcements for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_team_role(team_id, array['owner','admin']::public.team_role[])
);

create policy "Owners and admins can create notifications"
on public.notifications for insert to authenticated
with check (
  private.has_team_role(team_id, array['owner','admin']::public.team_role[])
);
