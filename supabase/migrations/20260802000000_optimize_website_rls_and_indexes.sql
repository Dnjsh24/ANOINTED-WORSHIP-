-- Website-only policy cleanup and index coverage discovered by the production
-- Supabase advisors. This migration intentionally leaves desktop/offline-sync
-- tables unchanged.

-- Foreign-key indexes keep deletes and relationship joins bounded as the
-- website tables grow. All statements are repeatable for local reset safety.
create index if not exists activity_logs_profile_id_idx
  on public.activity_logs (profile_id);
create index if not exists activity_logs_team_id_idx
  on public.activity_logs (team_id);
create index if not exists announcements_event_id_idx
  on public.announcements (event_id);
create index if not exists announcements_target_profile_id_idx
  on public.announcements (target_profile_id);
create index if not exists channel_reads_channel_id_idx
  on public.channel_reads (channel_id);
create index if not exists custom_roles_team_id_idx
  on public.custom_roles (team_id);
create index if not exists feedback_reports_profile_id_idx
  on public.feedback_reports (profile_id);
create index if not exists message_reads_profile_id_idx
  on public.message_reads (profile_id);
create index if not exists notifications_created_by_idx
  on public.notifications (created_by);
create index if not exists notifications_event_id_idx
  on public.notifications (event_id);
create index if not exists notifications_target_profile_id_idx
  on public.notifications (target_profile_id);
create index if not exists push_subscriptions_profile_id_idx
  on public.push_subscriptions (profile_id);
create index if not exists service_templates_created_by_idx
  on public.service_templates (created_by);
create index if not exists setlist_change_log_changed_by_idx
  on public.setlist_change_log (changed_by);
create index if not exists setlist_templates_created_by_idx
  on public.setlist_templates (created_by);
create index if not exists setlist_templates_team_id_idx
  on public.setlist_templates (team_id);
create index if not exists team_invitations_invited_by_idx
  on public.team_invitations (invited_by);
create index if not exists team_members_custom_role_id_idx
  on public.team_members (custom_role_id);
create index if not exists user_annotations_profile_id_idx
  on public.user_annotations (profile_id);
create index if not exists user_push_tokens_user_id_idx
  on public.user_push_tokens (user_id);
create index if not exists worship_remote_pairing_sessions_created_by_idx
  on public.worship_remote_pairing_sessions (created_by);
create index if not exists worship_remote_pairing_sessions_paired_by_idx
  on public.worship_remote_pairing_sessions (paired_by);
create index if not exists worship_remote_pairing_sessions_setlist_id_idx
  on public.worship_remote_pairing_sessions (setlist_id);
create index if not exists worship_remote_pairing_sessions_team_id_idx
  on public.worship_remote_pairing_sessions (team_id);

-- The hosted project implicitly granted DML on tables created after the
-- baseline migration, while a clean local replay did not. Declare the website
-- table contract explicitly and remove privileges that PostgREST never needs.
grant select, insert, update, delete on table
  public.activity_logs,
  public.announcement_receipts,
  public.announcements,
  public.attendance,
  public.channel_reads,
  public.custom_roles,
  public.dance_notes,
  public.event_assignments,
  public.events,
  public.feedback_reports,
  public.join_requests,
  public.message_channel_members,
  public.message_channels,
  public.message_reads,
  public.messages,
  public.monthly_schedules,
  public.notifications,
  public.practice_files,
  public.prayer_requests,
  public.profiles,
  public.push_subscriptions,
  public.service_templates,
  public.setlist_change_log,
  public.setlist_songs,
  public.setlist_templates,
  public.setlists,
  public.song_edit_requests,
  public.song_favorites,
  public.song_versions,
  public.songs,
  public.team_invitations,
  public.team_members,
  public.team_settings,
  public.teams,
  public.user_annotations,
  public.user_push_tokens,
  public.worship_remote_pairing_sessions
to authenticated;

revoke truncate, references, trigger on table
  public.activity_logs,
  public.announcement_receipts,
  public.announcements,
  public.attendance,
  public.channel_reads,
  public.custom_roles,
  public.dance_notes,
  public.event_assignments,
  public.events,
  public.feedback_reports,
  public.join_requests,
  public.message_channel_members,
  public.message_channels,
  public.message_reads,
  public.messages,
  public.monthly_schedules,
  public.notifications,
  public.practice_files,
  public.prayer_requests,
  public.profiles,
  public.push_subscriptions,
  public.service_templates,
  public.setlist_change_log,
  public.setlist_songs,
  public.setlist_templates,
  public.setlists,
  public.song_edit_requests,
  public.song_favorites,
  public.song_versions,
  public.songs,
  public.team_invitations,
  public.team_members,
  public.team_settings,
  public.teams,
  public.user_annotations,
  public.user_push_tokens,
  public.worship_remote_pairing_sessions
from authenticated;

revoke all on table
  public.activity_logs,
  public.announcement_receipts,
  public.announcements,
  public.attendance,
  public.channel_reads,
  public.custom_roles,
  public.dance_notes,
  public.event_assignments,
  public.events,
  public.feedback_reports,
  public.join_requests,
  public.message_channel_members,
  public.message_channels,
  public.message_reads,
  public.messages,
  public.monthly_schedules,
  public.notifications,
  public.practice_files,
  public.prayer_requests,
  public.profiles,
  public.push_subscriptions,
  public.service_templates,
  public.setlist_change_log,
  public.setlist_songs,
  public.setlist_templates,
  public.setlists,
  public.song_edit_requests,
  public.song_favorites,
  public.song_versions,
  public.songs,
  public.team_invitations,
  public.team_members,
  public.team_settings,
  public.teams,
  public.user_annotations,
  public.user_push_tokens,
  public.worship_remote_pairing_sessions
from anon;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

-- Activity logs: only the signed-in profile may write a log for one of their
-- active teams. Wrapping auth.uid() in SELECT lets Postgres evaluate it once.
drop policy if exists "Users can view activity logs for their team" on public.activity_logs;
create policy "Active members can view activity logs"
  on public.activity_logs for select to authenticated
  using (private.is_approved_member(team_id));

drop policy if exists "Users can insert activity logs for their team" on public.activity_logs;
create policy "Active members can create their own activity logs"
  on public.activity_logs for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and private.is_approved_member(team_id)
  );

-- Read receipts were previously exposed through policies granted to every
-- database role. Keep the same website behavior while requiring authentication
-- and active channel membership.
drop policy if exists "Users can manage their own channel reads" on public.channel_reads;
create policy "Users can manage their own channel reads"
  on public.channel_reads for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists "Users can view channel reads for their channels" on public.channel_reads;
create policy "Users can view channel reads for their channels"
  on public.channel_reads for select to authenticated
  using (
    exists (
      select 1
      from public.message_channel_members cm
      join public.team_members tm on tm.id = cm.team_member_id
      where cm.channel_id = channel_reads.channel_id
        and tm.profile_id = (select auth.uid())
        and tm.status = 'active'
    )
  );

drop policy if exists "Users can manage their own message reads" on public.message_reads;
create policy "Users can manage their own message reads"
  on public.message_reads for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

drop policy if exists "Users can view message reads for their channels" on public.message_reads;
create policy "Users can view message reads for their channels"
  on public.message_reads for select to authenticated
  using (
    exists (
      select 1
      from public.messages m
      join public.message_channel_members cm on cm.channel_id = m.channel_id
      join public.team_members tm on tm.id = cm.team_member_id
      where m.id = message_reads.message_id
        and tm.profile_id = (select auth.uid())
        and tm.status = 'active'
    )
  );

-- Remove policy-name duplicates introduced by overlapping historical feature
-- migrations and use the shared active-membership helpers consistently.
drop policy if exists "Users can view their team custom roles" on public.custom_roles;
drop policy if exists "Team members can view custom roles" on public.custom_roles;
create policy "Active members can view custom roles"
  on public.custom_roles for select to authenticated
  using (private.is_approved_member(team_id));

drop policy if exists "Team admins can manage custom roles" on public.custom_roles;
drop policy if exists "Admins can manage custom roles" on public.custom_roles;
create policy "Team admins can manage custom roles"
  on public.custom_roles for all to authenticated
  using (
    private.has_team_role(
      team_id,
      array['owner', 'admin', 'pastor']::public.team_role[]
    )
  )
  with check (
    private.has_team_role(
      team_id,
      array['owner', 'admin', 'pastor']::public.team_role[]
    )
  );

-- A feedback author must be the signed-in user. Earlier policies checked only
-- team membership, allowing a caller to spoof another profile_id.
drop policy if exists "members can insert feedback reports" on public.feedback_reports;
drop policy if exists "team members can insert feedback" on public.feedback_reports;
create policy "Active members can create their own feedback reports"
  on public.feedback_reports for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and private.is_approved_member(team_id)
  );

drop policy if exists "owners and admins can view feedback reports" on public.feedback_reports;
drop policy if exists "owner/admin can view feedback" on public.feedback_reports;
create policy "Members can read permitted feedback reports"
  on public.feedback_reports for select to authenticated
  using (
    profile_id = (select auth.uid())
    or private.has_team_role(
      team_id,
      array['owner', 'admin']::public.team_role[]
    )
  );

drop policy if exists "Users can manage their own push subscriptions" on public.push_subscriptions;
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- The generic changelog policies duplicated stricter, team-aware policies and
-- let any member insert history. Keep only the existing manager/member rules,
-- scoped explicitly to authenticated users.
drop policy if exists "System can insert changelog" on public.setlist_change_log;
drop policy if exists "Team members can view changelog" on public.setlist_change_log;
drop policy if exists "Team members view changelog" on public.setlist_change_log;
drop policy if exists "Members can read setlist history" on public.setlist_change_log;
create policy "Members can read setlist history"
  on public.setlist_change_log for select to authenticated
  using (private.is_approved_member(team_id));

drop policy if exists "Setlist managers can create setlist history" on public.setlist_change_log;
create policy "Setlist managers can create setlist history"
  on public.setlist_change_log for insert to authenticated
  with check (
    private.has_team_role(
      team_id,
      array['owner', 'admin', 'worship_leader', 'band_leader']::public.team_role[]
    )
  );

-- Restore the intended owner/admin permanent-delete boundary as a forward
-- migration so clean databases and production no longer depend on drifted
-- historical policy state.
drop policy if exists "Leaders can delete team songs" on public.songs;
drop policy if exists "Song managers can delete team songs" on public.songs;
create policy "Song managers can delete team songs"
  on public.songs for delete to authenticated
  using (
    private.has_team_role(
      team_id,
      array['owner', 'admin']::public.team_role[]
    )
  );

-- An annotation can reference only a setlist song in a team where the author
-- is still active. This closes cross-team UUID attachment and post-membership
-- read paths while preserving private per-user notes.
drop policy if exists "Users can view their own annotations" on public.user_annotations;
create policy "Users can view their own annotations"
  on public.user_annotations for select to authenticated
  using (
    profile_id = (select auth.uid())
    and exists (
      select 1
      from public.setlist_songs ss
      join public.setlists sl on sl.id = ss.setlist_id
      where ss.id = user_annotations.setlist_song_id
        and private.is_approved_member(sl.team_id)
    )
  );

drop policy if exists "Users can insert their own annotations" on public.user_annotations;
create policy "Users can insert their own annotations"
  on public.user_annotations for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (
      select 1
      from public.setlist_songs ss
      join public.setlists sl on sl.id = ss.setlist_id
      where ss.id = user_annotations.setlist_song_id
        and private.is_approved_member(sl.team_id)
    )
  );

drop policy if exists "Users can update their own annotations" on public.user_annotations;
create policy "Users can update their own annotations"
  on public.user_annotations for update to authenticated
  using (
    profile_id = (select auth.uid())
    and exists (
      select 1
      from public.setlist_songs ss
      join public.setlists sl on sl.id = ss.setlist_id
      where ss.id = user_annotations.setlist_song_id
        and private.is_approved_member(sl.team_id)
    )
  )
  with check (
    profile_id = (select auth.uid())
    and exists (
      select 1
      from public.setlist_songs ss
      join public.setlists sl on sl.id = ss.setlist_id
      where ss.id = user_annotations.setlist_song_id
        and private.is_approved_member(sl.team_id)
    )
  );

drop policy if exists "Users can delete their own annotations" on public.user_annotations;
create policy "Users can delete their own annotations"
  on public.user_annotations for delete to authenticated
  using (
    profile_id = (select auth.uid())
    and exists (
      select 1
      from public.setlist_songs ss
      join public.setlists sl on sl.id = ss.setlist_id
      where ss.id = user_annotations.setlist_song_id
        and private.is_approved_member(sl.team_id)
    )
  );

drop policy if exists "Users can manage their own push tokens" on public.user_push_tokens;
create policy "Users can manage their own push tokens"
  on public.user_push_tokens for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Keep the public RPC's intentional, one-time SECURITY DEFINER contract, but
-- pin its private role-check helper to an empty search path as well.
alter function private.is_worship_remote_operator(uuid) set search_path = '';

drop policy if exists "Remote creators read their pairing sessions"
  on public.worship_remote_pairing_sessions;
create policy "Remote creators read their pairing sessions"
  on public.worship_remote_pairing_sessions for select to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists "Remote creators revoke their pairing sessions"
  on public.worship_remote_pairing_sessions;
create policy "Remote creators revoke their pairing sessions"
  on public.worship_remote_pairing_sessions for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists "Remote operators create their own pairing sessions"
  on public.worship_remote_pairing_sessions;
create policy "Remote operators create their own pairing sessions"
  on public.worship_remote_pairing_sessions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.is_worship_remote_operator(team_id)
  );
