-- PostgreSQL ORs permissive policies for the same role/action. Consolidate the
-- remaining website groups so each row evaluates one policy expression while
-- preserving the original authorization paths.

drop policy if exists "Members can read own announcement receipts" on public.announcement_receipts;
drop policy if exists "Owners and admins can read announcement receipts" on public.announcement_receipts;
create policy "Authorized users can read announcement receipts"
on public.announcement_receipts for select to authenticated
using (
  profile_id = (select auth.uid())
  or private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
);

drop policy if exists "Members can create own announcement receipts" on public.announcement_receipts;
drop policy if exists "Owners and admins can create announcement receipts" on public.announcement_receipts;
create policy "Authorized users can create announcement receipts"
on public.announcement_receipts for insert to authenticated
with check (
  (
    (
      profile_id = (select auth.uid())
      and private.is_approved_member(team_id)
    )
    or private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
  )
  and exists (
    select 1
    from public.announcements a
    where a.id = announcement_receipts.announcement_id
      and a.team_id = announcement_receipts.team_id
  )
);

drop policy if exists "Owners and admins can review events" on public.events;
drop policy if exists "Event managers can update approved events" on public.events;
create policy "Authorized event managers can update events"
on public.events for update to authenticated
using (
  private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
  or (
    approval_status = 'approved'
    and private.has_team_role(team_id, array['pastor', 'worship_leader']::public.team_role[])
  )
)
with check (
  private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
  or (
    approval_status = 'approved'
    and private.has_team_role(team_id, array['pastor', 'worship_leader']::public.team_role[])
  )
);

drop policy if exists "Owners and admins can delete events" on public.events;
drop policy if exists "Event managers can delete approved events" on public.events;
create policy "Authorized event managers can delete events"
on public.events for delete to authenticated
using (
  private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
  or (
    approval_status = 'approved'
    and private.has_team_role(team_id, array['pastor', 'worship_leader']::public.team_role[])
  )
);

drop policy if exists "Admins can review join requests" on public.join_requests;
drop policy if exists "Users can cancel own pending join requests" on public.join_requests;
create policy "Authorized users can update join requests"
on public.join_requests for update to authenticated
using (
  private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
  or (
    profile_id = (select auth.uid())
    and status = 'pending'
  )
)
with check (
  private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
  or (
    profile_id = (select auth.uid())
    and status = 'canceled'
  )
);

drop policy if exists "Users can read own notifications" on public.notifications;
drop policy if exists "Owners and admins can read team notifications" on public.notifications;
create policy "Authorized users can read notifications"
on public.notifications for select to authenticated
using (
  profile_id = (select auth.uid())
  or private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
);

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Team members can view fellow member profiles" on public.profiles;
drop policy if exists "Admins can view join requester profiles" on public.profiles;
create policy "Authorized users can view profiles"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.team_members my_tm
    join public.team_members their_tm on their_tm.team_id = my_tm.team_id
    where my_tm.profile_id = (select auth.uid())
      and my_tm.status = 'active'
      and their_tm.profile_id = profiles.id
  )
  or exists (
    select 1
    from public.join_requests jr
    join public.team_members tm on tm.team_id = jr.team_id
    where jr.profile_id = profiles.id
      and jr.status = 'pending'
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
      and tm.role = any (array['owner', 'admin']::public.team_role[])
  )
);

drop policy if exists "Admins can delete team members" on public.team_members;
drop policy if exists "Users can leave teams" on public.team_members;
create policy "Authorized users can delete team members"
on public.team_members for delete to authenticated
using (
  profile_id = (select auth.uid())
  or private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
);

drop policy if exists "Admins can insert team members" on public.team_members;
drop policy if exists "Owners can add themselves as first member" on public.team_members;
create policy "Authorized users can insert team members"
on public.team_members for insert to authenticated
with check (
  private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
  or (
    profile_id = (select auth.uid())
    and role = 'owner'
    and status = 'active'
    and private.is_team_owner(team_id)
  )
);

-- The public team directory policy already permits every authenticated user,
-- so the narrower member policy is redundant.
drop policy if exists "Members can view their teams" on public.teams;
