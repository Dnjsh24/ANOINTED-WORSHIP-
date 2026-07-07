-- Fix: Allow team owners/admins to remove members from the team.
create policy "Admins can delete team members"
on public.team_members for delete to authenticated
using (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));

-- Allow users to delete themselves (leave team)
create policy "Users can leave teams"
on public.team_members for delete to authenticated
using (profile_id = (select auth.uid()));
