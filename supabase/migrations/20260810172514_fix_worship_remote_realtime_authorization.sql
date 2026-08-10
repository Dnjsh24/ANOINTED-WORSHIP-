-- Realtime's authorization probe creates synthetic messages with only the
-- topic and extension populated. The private-channel setting is enforced by
-- Realtime before RLS and is not copied into realtime.messages.private, so a
-- `private = true` predicate rejects every otherwise-valid private join.

begin;

drop policy if exists "Worship remote operators can receive private broadcasts" on realtime.messages;
create policy "Worship remote operators can receive private broadcasts"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (
    (
      split_part(realtime.topic(), ':', 1) = 'worship-remote'
      and exists (
        select 1
        from public.setlists setlists
        join public.team_members members on members.team_id = setlists.team_id
        where setlists.id::text = split_part(realtime.topic(), ':', 2)
          and members.profile_id = (select auth.uid())
          and members.status = 'active'
          and members.role in ('owner', 'admin', 'worship_leader', 'band_leader', 'media')
      )
    )
    or private.can_access_worship_remote_session(realtime.topic())
  )
);

drop policy if exists "Worship remote operators can send private broadcasts" on realtime.messages;
create policy "Worship remote operators can send private broadcasts"
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and (
    (
      split_part(realtime.topic(), ':', 1) = 'worship-remote'
      and exists (
        select 1
        from public.setlists setlists
        join public.team_members members on members.team_id = setlists.team_id
        where setlists.id::text = split_part(realtime.topic(), ':', 2)
          and members.profile_id = (select auth.uid())
          and members.status = 'active'
          and members.role in ('owner', 'admin', 'worship_leader', 'band_leader', 'media')
      )
    )
    or private.can_access_worship_remote_session(realtime.topic())
  )
);

commit;
