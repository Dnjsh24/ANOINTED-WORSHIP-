-- Private Realtime authorization for the authenticated phone/desktop Remote.
-- Topic format: worship-remote:<setlist UUID>.  A user can only join a topic
-- for an active team membership and an operator-capable team role.
--
-- Supabase Dashboard prerequisite: Realtime > Settings > disable
-- "Allow public access" before enabling the private client channel.

drop policy if exists "Worship remote operators can receive private broadcasts" on realtime.messages;
create policy "Worship remote operators can receive private broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.private = true
  and split_part(realtime.topic(), ':', 1) = 'worship-remote'
  and exists (
    select 1
    from public.setlists s
    join public.team_members tm on tm.team_id = s.team_id
    where s.id::text = split_part(realtime.topic(), ':', 2)
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
      and tm.role in ('owner', 'admin', 'worship_leader', 'band_leader', 'media')
  )
);

drop policy if exists "Worship remote operators can send private broadcasts" on realtime.messages;
create policy "Worship remote operators can send private broadcasts"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.private = true
  and split_part(realtime.topic(), ':', 1) = 'worship-remote'
  and exists (
    select 1
    from public.setlists s
    join public.team_members tm on tm.team_id = s.team_id
    where s.id::text = split_part(realtime.topic(), ':', 2)
      and tm.profile_id = (select auth.uid())
      and tm.status = 'active'
      and tm.role in ('owner', 'admin', 'worship_leader', 'band_leader', 'media')
  )
);
