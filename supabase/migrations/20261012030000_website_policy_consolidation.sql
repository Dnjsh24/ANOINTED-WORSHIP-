-- Consolidate only the nine overlapping permissive authenticated policy groups.
-- OR each original USING and WITH CHECK independently. All changed write
-- policies have explicit checks; retain USING fallback if a check is omitted.
-- Restrictive policies, grants and row triggers remain in place.
begin;

alter policy "Owners and admins can update teams" on public.teams
  using (
    (private.has_team_role(id, array['owner','admin']::public.team_role[]))
    or (private.has_team_permission(id,'team.manage') or private.has_team_permission(id,'members.manage'))
  )
  with check (
    (private.has_team_role(id, array['owner','admin']::public.team_role[]))
    or (private.has_team_permission(id,'team.manage') or private.has_team_permission(id,'members.manage'))
  );
drop policy "Delegated settings update team" on public.teams;

alter policy "Users and admins can view join requests" on public.join_requests
  using (
    (profile_id = (select auth.uid()) or private.has_team_role(team_id, array['owner','admin']::public.team_role[]))
    or (private.has_team_permission(team_id,'members.manage'))
  );
drop policy "Delegated managers read join requests" on public.join_requests;

alter policy "Creators and owners admins edit songs" on public.songs
  using (
    (private.is_approved_member(team_id) and (created_by=(select auth.uid())
        or private.has_team_role(team_id,array['owner','admin']::public.team_role[]))
        or private.has_team_role(team_id,array['worship_leader']::public.team_role[]))
    or (private.has_team_permission(team_id,'songs.edit'))
  )
  with check (
    (private.is_approved_member(team_id) and (created_by=(select auth.uid())
        or private.has_team_role(team_id,array['owner','admin']::public.team_role[]))
        or private.has_team_role(team_id,array['worship_leader']::public.team_role[]))
    or (private.has_team_permission(team_id,'songs.edit'))
  );
drop policy "Delegated editors update songs" on public.songs;

alter policy "Owners and admins can manage team settings" on public.team_settings
  using (
    (private.has_team_role(team_id, array['owner','admin']::public.team_role[]))
    or (private.has_team_permission(team_id,'team.manage'))
  )
  with check (
    (private.has_team_role(team_id, array['owner','admin']::public.team_role[]))
    or (private.has_team_permission(team_id,'team.manage'))
  );
drop policy "Delegated settings manage defaults" on public.team_settings;

alter policy "Authorized users can view profiles" on public.profiles
  using (
    (
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
    )
    or (exists(select 1 from public.join_requests jr where jr.profile_id=profiles.id and jr.status='pending' and private.has_team_permission(jr.team_id,'members.manage')))
  );
drop policy "Delegated managers read pending requester profiles" on public.profiles;

alter policy "Owners and admins can update team members" on public.team_members
  using (
    (
      private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
    )
    or (private.has_team_permission(team_id,'members.manage'))
  )
  with check (
    (
      private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
    )
    or (private.has_team_permission(team_id,'members.manage'))
  );
drop policy "Delegated members update roster" on public.team_members;

alter policy "Authorized users can delete non-owner members" on public.team_members
  using (
    (
      role <> 'owner'
      and (
        profile_id = (select auth.uid())
        or private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
      )
    )
    or (role<>'owner' and private.has_team_permission(team_id,'members.manage'))
  );
drop policy "Delegated members remove non-owner roster" on public.team_members;

alter policy "Authorized users can insert non-owner members" on public.team_members
  with check (
    (
      (
        role <> 'owner'
        and private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
      )
      or (
        profile_id = (select auth.uid())
        and role = 'owner'
        and status = 'active'
        and private.is_team_owner(team_id)
        and not exists (
          select 1 from public.team_members existing where existing.team_id = team_members.team_id
        )
      )
    )
    or (role<>'owner' and private.has_team_permission(team_id,'members.manage'))
  );
drop policy "Delegated members add non-owner roster" on public.team_members;

alter policy "Authorized users can update pending join requests" on public.join_requests
  using (
    (
      status = 'pending'
      and (
        profile_id = (select auth.uid())
        or private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
      )
    )
    or (status='pending' and private.has_team_permission(team_id,'members.manage'))
  )
  with check (
    (
      (
        profile_id = (select auth.uid())
        and status = 'canceled'
        and reviewed_by is null
        and reviewed_at is null
      )
      or (
        private.has_team_role(team_id, array['owner', 'admin']::public.team_role[])
        and status in ('approved', 'rejected')
        and reviewed_by = (select auth.uid())
        and reviewed_at is not null
      )
    )
    or (status in ('approved','rejected') and reviewed_by=(select auth.uid())
        and reviewed_at is not null and private.has_team_permission(team_id,'members.manage'))
  );
drop policy "Delegated managers review pending join requests" on public.join_requests;

commit;
