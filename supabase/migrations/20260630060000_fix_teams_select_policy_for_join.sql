-- Fix: Allow any authenticated user to select/view teams so that
-- non-members can successfully look up a team using its access code when joining.
--
-- The previous policy restricted SELECT to approved members only, which caused
-- the joinTeamAction to silently fail/not-found when a new user entered a code.

create policy "Authenticated users can view teams to join them"
on public.teams for select to authenticated
using (true);
