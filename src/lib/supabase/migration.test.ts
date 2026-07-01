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
});
