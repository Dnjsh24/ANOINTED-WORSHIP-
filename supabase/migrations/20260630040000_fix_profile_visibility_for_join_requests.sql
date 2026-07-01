-- Fix: Allow team admins/owners to see profiles of users who submitted
-- join requests to their team. Without this, the "Pending Requests" section
-- on the Members page cannot display the requester's name or email because
-- the existing profiles SELECT policy only lets users see their own profile.
--
-- Also allow approved team members to see each other's profiles (needed for
-- member listings, message authors, event assignments, etc.).

create policy "Team members can view fellow member profiles"
on public.profiles for select to authenticated
using (
  exists (
    select 1
    from public.team_members my_tm
    join public.team_members their_tm on their_tm.team_id = my_tm.team_id
    where my_tm.profile_id = (select auth.uid())
      and my_tm.status = 'active'
      and their_tm.profile_id = profiles.id
  )
);

create policy "Admins can view join requester profiles"
on public.profiles for select to authenticated
using (
  exists (
    select 1
    from public.join_requests jr
    join public.team_members tm on tm.team_id = jr.team_id
    where jr.profile_id = profiles.id
      and jr.status = 'pending'
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
      and tm.role in ('owner', 'admin')
  )
);
