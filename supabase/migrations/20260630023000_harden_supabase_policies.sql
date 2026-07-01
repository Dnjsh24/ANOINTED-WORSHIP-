revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

drop policy if exists "Leaders can manage events" on public.events;
create policy "Leaders can create events"
on public.events for insert to authenticated
with check (private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[]));

create policy "Leaders can update events"
on public.events for update to authenticated
using (private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[]));

create policy "Leaders can delete events"
on public.events for delete to authenticated
using (private.has_team_role(team_id, array['owner','admin','pastor','worship_leader']::public.team_role[]));

drop policy if exists "Song reviewers can view and review edits" on public.song_edit_requests;
drop policy if exists "Members can submit song edits" on public.song_edit_requests;

create policy "Members can submit song edits"
on public.song_edit_requests for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and exists (
    select 1
    from public.songs s
    where s.id = song_id and private.is_approved_member(s.team_id)
  )
);

create policy "Song reviewers can view edits"
on public.song_edit_requests for select to authenticated
using (exists (
  select 1 from public.songs s
  where s.id = song_id
    and private.has_team_role(s.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
));

create policy "Song reviewers can update edits"
on public.song_edit_requests for update to authenticated
using (exists (
  select 1 from public.songs s
  where s.id = song_id
    and private.has_team_role(s.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
))
with check (exists (
  select 1 from public.songs s
  where s.id = song_id
    and private.has_team_role(s.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
));

create policy "Song reviewers can delete edits"
on public.song_edit_requests for delete to authenticated
using (exists (
  select 1 from public.songs s
  where s.id = song_id
    and private.has_team_role(s.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
));

drop policy if exists "Leaders can manage setlists" on public.setlists;
create policy "Leaders can create setlists"
on public.setlists for insert to authenticated
with check (private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[]));

create policy "Leaders can update setlists"
on public.setlists for update to authenticated
using (private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[]));

create policy "Leaders can delete setlists"
on public.setlists for delete to authenticated
using (private.has_team_role(team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[]));

drop policy if exists "Leaders can manage setlist songs" on public.setlist_songs;
create policy "Leaders can create setlist songs"
on public.setlist_songs for insert to authenticated
with check (exists (
  select 1 from public.setlists sl
  where sl.id = setlist_id
    and private.has_team_role(sl.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
));

create policy "Leaders can update setlist songs"
on public.setlist_songs for update to authenticated
using (exists (
  select 1 from public.setlists sl
  where sl.id = setlist_id
    and private.has_team_role(sl.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
))
with check (exists (
  select 1 from public.setlists sl
  where sl.id = setlist_id
    and private.has_team_role(sl.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
));

create policy "Leaders can delete setlist songs"
on public.setlist_songs for delete to authenticated
using (exists (
  select 1 from public.setlists sl
  where sl.id = setlist_id
    and private.has_team_role(sl.team_id, array['owner','admin','worship_leader','band_leader']::public.team_role[])
));

drop policy if exists "Leaders can manage monthly schedules" on public.monthly_schedules;
create policy "Leaders can create monthly schedules"
on public.monthly_schedules for insert to authenticated
with check (private.has_team_role(team_id, array['owner','admin','worship_leader']::public.team_role[]));

create policy "Leaders can update monthly schedules"
on public.monthly_schedules for update to authenticated
using (private.has_team_role(team_id, array['owner','admin','worship_leader']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin','worship_leader']::public.team_role[]));

create policy "Leaders can delete monthly schedules"
on public.monthly_schedules for delete to authenticated
using (private.has_team_role(team_id, array['owner','admin','worship_leader']::public.team_role[]));

drop policy if exists "Dancers and leaders can manage dance notes" on public.dance_notes;
create policy "Dancers and leaders can create dance notes"
on public.dance_notes for insert to authenticated
with check (private.has_team_role(team_id, array['owner','admin','worship_leader','dancer']::public.team_role[]));

create policy "Dancers and leaders can update dance notes"
on public.dance_notes for update to authenticated
using (private.has_team_role(team_id, array['owner','admin','worship_leader','dancer']::public.team_role[]))
with check (private.has_team_role(team_id, array['owner','admin','worship_leader','dancer']::public.team_role[]));

create policy "Dancers and leaders can delete dance notes"
on public.dance_notes for delete to authenticated
using (private.has_team_role(team_id, array['owner','admin','worship_leader','dancer']::public.team_role[]));

create index if not exists announcements_created_by_idx on public.announcements (created_by);
create index if not exists attendance_team_member_id_idx on public.attendance (team_member_id);
create index if not exists dance_notes_created_by_idx on public.dance_notes (created_by);
create index if not exists dance_notes_event_id_idx on public.dance_notes (event_id);
create index if not exists dance_notes_song_id_idx on public.dance_notes (song_id);
create index if not exists dance_notes_team_id_idx on public.dance_notes (team_id);
create index if not exists event_assignments_team_member_id_idx on public.event_assignments (team_member_id);
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists join_requests_profile_id_idx on public.join_requests (profile_id);
create index if not exists join_requests_reviewed_by_idx on public.join_requests (reviewed_by);
create index if not exists message_channel_members_team_member_id_idx on public.message_channel_members (team_member_id);
create index if not exists message_channels_created_by_idx on public.message_channels (created_by);
create index if not exists message_channels_team_id_idx on public.message_channels (team_id);
create index if not exists messages_attachment_file_id_idx on public.messages (attachment_file_id);
create index if not exists messages_sender_member_id_idx on public.messages (sender_member_id);
create index if not exists monthly_schedules_created_by_idx on public.monthly_schedules (created_by);
create index if not exists monthly_schedules_team_id_idx on public.monthly_schedules (team_id);
create index if not exists notifications_team_id_idx on public.notifications (team_id);
create index if not exists practice_files_event_id_idx on public.practice_files (event_id);
create index if not exists practice_files_song_id_idx on public.practice_files (song_id);
create index if not exists practice_files_uploaded_by_idx on public.practice_files (uploaded_by);
create index if not exists prayer_requests_created_by_idx on public.prayer_requests (created_by);
create index if not exists prayer_requests_team_id_idx on public.prayer_requests (team_id);
create index if not exists setlist_songs_lead_member_id_idx on public.setlist_songs (lead_member_id);
create index if not exists setlist_songs_song_id_idx on public.setlist_songs (song_id);
create index if not exists setlists_created_by_idx on public.setlists (created_by);
create index if not exists setlists_event_id_idx on public.setlists (event_id);
create index if not exists setlists_leader_member_id_idx on public.setlists (leader_member_id);
create index if not exists song_edit_requests_reviewed_by_idx on public.song_edit_requests (reviewed_by);
create index if not exists song_edit_requests_song_id_idx on public.song_edit_requests (song_id);
create index if not exists song_edit_requests_submitted_by_idx on public.song_edit_requests (submitted_by);
create index if not exists song_versions_changed_by_idx on public.song_versions (changed_by);
create index if not exists songs_created_by_idx on public.songs (created_by);
