-- Fix: Allow team owners/admins to insert new rows into team_members.
-- Without this, when an admin approves a join request, the database blocks
-- them from adding the user to the team_members table, causing approval to fail.

create policy "Admins can insert team members"
on public.team_members for insert to authenticated
with check (private.has_team_role(team_id, array['owner','admin']::public.team_role[]));
