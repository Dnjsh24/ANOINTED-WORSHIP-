drop policy if exists "Leaders can create channels" on public.message_channels;

drop policy if exists "Approved members can create message channels" on public.message_channels;
create policy "Approved members can create message channels v2"
on public.message_channels for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_approved_member(team_id)
  and (
    channel_type = 'direct'
    or private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
  )
);

drop policy if exists "Authorized members can add channel members" on public.message_channel_members;
create policy "Authorized members can add channel members"
on public.message_channel_members for insert to authenticated
with check (
  exists (
    select 1
    from public.message_channels c
    join public.team_members target_tm
      on target_tm.id = team_member_id
      and target_tm.team_id = c.team_id
      and target_tm.status = 'active'
    where c.id = channel_id
      and (
        private.has_team_role(c.team_id, array['owner','admin']::public.team_role[])
        or (c.channel_type = 'direct' and c.created_by = (select auth.uid()))
      )
  )
);
