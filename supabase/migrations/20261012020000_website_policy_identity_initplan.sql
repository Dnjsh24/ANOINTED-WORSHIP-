-- Preserve all six policy conditions; evaluate caller identity once per statement.
-- ALTER POLICY retains roles, commands and permissive/restrictive behavior.
begin;

alter policy "Actor and eligible reviewer can read bounded shared requests" on public.shared_edit_requests
  using (private.can_read_shared_target(target_type,target_id,team_id)
    and (requested_by=(select auth.uid()) or private.can_review_shared_edit(team_id,target_type)));

alter policy "Active members add songs with immutable identity" on public.songs
  with check (private.is_approved_member(team_id) and created_by=(select auth.uid())
    and status='approved' and deleted_at is null);

alter policy "Creators and owners admins edit songs" on public.songs
  using (private.is_approved_member(team_id) and (created_by=(select auth.uid())
    or private.has_team_role(team_id,array['owner','admin']::public.team_role[]))
    or private.has_team_role(team_id,array['worship_leader']::public.team_role[]))
  with check (private.is_approved_member(team_id) and (created_by=(select auth.uid())
    or private.has_team_role(team_id,array['owner','admin']::public.team_role[]))
    or private.has_team_role(team_id,array['worship_leader']::public.team_role[]));

alter policy "Requester and owners admins read legacy song edits" on public.song_edit_requests
  using (exists(select 1 from public.songs s where s.id=song_id and private.is_approved_member(s.team_id)
    and (submitted_by=(select auth.uid()) or private.has_team_role(s.team_id,array['owner','admin']::public.team_role[]))));

alter policy "Revoked managers cannot read others join requests" on public.join_requests
  using (profile_id=(select auth.uid()) or private.has_team_permission(team_id,'members.manage'));

alter policy "Delegated managers review pending join requests" on public.join_requests
  using (status='pending' and private.has_team_permission(team_id,'members.manage'))
  with check (status in ('approved','rejected') and reviewed_by=(select auth.uid())
    and reviewed_at is not null and private.has_team_permission(team_id,'members.manage'));

commit;
