import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260630010000_anointed_worship_mvp.sql"),
  "utf8",
);
const hardeningMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260630023000_harden_supabase_policies.sql"),
  "utf8",
);
const teamCreationBootstrapMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260630011000_fix_team_creation_bootstrap.sql"),
  "utf8",
);
const interactionMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260630030000_interaction_mvp_persistence.sql"),
  "utf8",
);
const eventApprovalMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260702000000_add_event_approval_status.sql"),
  "utf8",
);
const targetedNoticesMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260702010000_targeted_announcements_reminders.sql"),
  "utf8",
);
const noticeAcknowledgementsMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260702020000_notice_acknowledgements_recurring_reminders.sql"),
  "utf8",
);
const serviceTemplatesMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260702030000_service_templates_conflicts_setlist_history.sql"),
  "utf8",
);
const messageChannelMembershipMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260703000000_fix_message_channel_membership_insert.sql"),
  "utf8",
);
const defaultTeamChannelsBackfillMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260703010000_backfill_default_team_channels.sql"),
  "utf8",
);
const atomicTeamLifecycleMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260703020000_atomic_team_workspace_lifecycle.sql"),
  "utf8",
);
const teamWorkspaceTemplateConflictMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260703030000_fix_create_team_workspace_template_conflict.sql"),
  "utf8",
);
const realtimeMessagesMigration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260703040000_enable_realtime_messages.sql"),
  "utf8",
);

const requiredTables = [
  "profiles",
  "teams",
  "team_members",
  "join_requests",
  "announcements",
  "events",
  "event_assignments",
  "songs",
  "song_versions",
  "song_edit_requests",
  "setlists",
  "setlist_songs",
  "attendance",
  "monthly_schedules",
  "dance_notes",
  "practice_files",
  "prayer_requests",
  "message_channels",
  "message_channel_members",
  "messages",
  "notifications",
];

describe("Supabase migration", () => {
  it("creates every MVP table", () => {
    for (const table of requiredTables) {
      expect(migration).toContain(`create table public.${table}`);
    }
  });

  it("enables row level security and private storage", () => {
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("private.is_approved_member");
    expect(migration).toContain("private.has_team_role");
    expect(migration).toContain("storage.buckets");
    expect(migration).toContain("practice-files");
  });

  it("indexes policy-critical membership columns", () => {
    expect(migration).toContain("team_members_team_profile_idx");
    expect(migration).toContain("join_requests_team_status_idx");
    expect(migration).toContain("messages_channel_created_idx");
  });

  it("hardens security definer functions and foreign key lookups", () => {
    expect(hardeningMigration).toContain("revoke execute on function public.handle_new_user()");
    expect(hardeningMigration).toContain("revoke execute on function public.rls_auto_enable()");
    expect(hardeningMigration).toContain("attendance_team_member_id_idx");
    expect(hardeningMigration).toContain("songs_created_by_idx");
  });

  it("allows the first workspace owner membership to bootstrap under RLS", () => {
    expect(teamCreationBootstrapMigration).toContain("private.is_team_owner");
    expect(teamCreationBootstrapMigration).toContain('drop policy if exists "Owners can add themselves as first member"');
    expect(teamCreationBootstrapMigration).toContain("with check (");
    expect(teamCreationBootstrapMigration).toContain("private.is_team_owner(team_id)");
  });

  it("adds persistence for interactive MVP controls", () => {
    expect(interactionMigration).toContain("create table if not exists public.team_settings");
    expect(interactionMigration).toContain("create table if not exists public.team_invitations");
    expect(interactionMigration).toContain("create table if not exists public.song_favorites");
    expect(interactionMigration).toContain("target_path");
    expect(interactionMigration).toContain("muted_at");
    expect(interactionMigration).toContain("Members can create own attendance");
    expect(interactionMigration).toContain("Channel members can update own membership");
  });

  it("requires approval for member-created event requests", () => {
    expect(eventApprovalMigration).toContain("approval_status");
    expect(eventApprovalMigration).toContain("Approved members can request events");
    expect(eventApprovalMigration).toContain("Owners and admins can review events");
    expect(eventApprovalMigration).toContain("approval_status = 'pending'");
  });

  it("supports targeted announcements and reminders", () => {
    expect(targetedNoticesMigration).toContain("target_role public.team_role");
    expect(targetedNoticesMigration).toContain("target_profile_id uuid");
    expect(targetedNoticesMigration).toContain("Targeted members can read announcements");
    expect(targetedNoticesMigration).toContain("Owners and admins can create announcements");
    expect(targetedNoticesMigration).toContain("Owners and admins can create notifications");
  });

  it("tracks notice acknowledgements and scheduled recurring reminders", () => {
    expect(noticeAcknowledgementsMigration).toContain("create table if not exists public.announcement_receipts");
    expect(noticeAcknowledgementsMigration).toContain("acknowledged_at timestamptz");
    expect(noticeAcknowledgementsMigration).toContain("scheduled_for timestamptz");
    expect(noticeAcknowledgementsMigration).toContain("recurrence_rule text");
    expect(noticeAcknowledgementsMigration).toContain("notice_group_id uuid");
    expect(noticeAcknowledgementsMigration).toContain("Owners and admins can read team notifications");
  });

  it("adds service templates and setlist version history", () => {
    expect(serviceTemplatesMigration).toContain("create table if not exists public.service_templates");
    expect(serviceTemplatesMigration).toContain("create table if not exists public.setlist_change_log");
    expect(serviceTemplatesMigration).toContain("Sunday Morning Service");
    expect(serviceTemplatesMigration).toContain("Members can read service templates");
    expect(serviceTemplatesMigration).toContain("Setlist managers can create setlist history");
  });

  it("allows authorized message channel membership inserts", () => {
    expect(messageChannelMembershipMigration).toContain("Approved members can create message channels");
    expect(messageChannelMembershipMigration).toContain("Authorized members can add channel members");
    expect(messageChannelMembershipMigration).toContain("c.channel_type = 'direct'");
    expect(messageChannelMembershipMigration).toContain("target_tm.team_id = c.team_id");
  });

  it("backfills default team channels for existing teams", () => {
    expect(defaultTeamChannelsBackfillMigration).toContain("insert into public.message_channels");
    expect(defaultTeamChannelsBackfillMigration).toContain("'Worship Team'");
    expect(defaultTeamChannelsBackfillMigration).toContain("tm.status = 'active'");
    expect(defaultTeamChannelsBackfillMigration).toContain("on conflict (channel_id, team_member_id) do nothing");
  });

  it("creates and deletes team workspaces atomically", () => {
    expect(atomicTeamLifecycleMigration).toContain("create or replace function public.create_team_workspace");
    expect(atomicTeamLifecycleMigration).toContain("insert into public.teams");
    expect(atomicTeamLifecycleMigration).toContain("insert into public.team_members");
    expect(atomicTeamLifecycleMigration).toContain("insert into public.message_channel_members");
    expect(atomicTeamLifecycleMigration).toContain("create or replace function public.delete_team_workspace");
    expect(atomicTeamLifecycleMigration).toContain("delete from public.teams");
    expect(atomicTeamLifecycleMigration).toContain("grant execute on function public.create_team_workspace");
  });

  it("uses the service template constraint name during atomic workspace creation", () => {
    expect(teamWorkspaceTemplateConflictMigration).toContain(
      "on conflict on constraint service_templates_team_id_name_key do nothing",
    );
    expect(teamWorkspaceTemplateConflictMigration).not.toContain("on conflict (team_id, name) do nothing");
  });

  it("enables realtime delivery for message inserts and channel memberships", () => {
    expect(realtimeMessagesMigration).toContain("alter publication supabase_realtime add table public.messages");
    expect(realtimeMessagesMigration).toContain("alter publication supabase_realtime add table public.message_channel_members");
    expect(realtimeMessagesMigration).toContain("pg_publication_tables");
  });
});
