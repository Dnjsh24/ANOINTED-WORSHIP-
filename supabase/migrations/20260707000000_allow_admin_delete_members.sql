-- Fix: Allow team owners/admins to remove members from the team.
drop policy if exists "Admins can delete team members" on public.team_members;
create policy "Admins can delete team members"
on public.team_members for delete to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

-- Allow users to delete themselves (leave team)
drop policy if exists "Users can leave teams" on public.team_members;
create policy "Users can leave teams"
on public.team_members for delete to authenticated
using (profile_id = (select auth.uid()));
