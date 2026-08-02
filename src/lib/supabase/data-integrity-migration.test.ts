import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = join(process.cwd(), "supabase", "migrations");
const sql = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationDirectory, name), "utf8"))
  .join("\n")
  .toLowerCase();

describe("forward-only website integrity migrations", () => {
  it("protects owner lifecycle with an explicit transfer function and last-owner guard", () => {
    expect(sql).toContain("transfer_team_ownership");
    expect(sql).toContain("cannot remove the final team owner");
    expect(sql).toContain("new.role = 'owner'");
    expect(sql).toContain("old.role = 'owner'");
    expect(sql).toContain("before update of role, status, team_id, profile_id, custom_role_id or delete");
    expect(sql).toContain('create policy "owners and admins can update team members"');
    expect(sql).toMatch(/alter function public\.create_team_workspace\(text, text, text, time, time\)\s+security definer;/);
  });

  it("constrains join requests to pending non-privileged roles", () => {
    expect(sql).toContain("join_requests_valid_submission");
    expect(sql).toContain("requested_role not in ('owner', 'admin')");
    expect(sql).toContain("reviewed_by is null");
    expect(sql).toContain("reviewed_at is null");
  });

  it("enforces same-team references for setlist songs, assignments, and dance notes", () => {
    expect(sql).toContain("validate_setlist_song_team");
    expect(sql).toContain("setlist song references must belong to the same team");
    expect(sql).toContain("validate_event_assignment_team");
    expect(sql).toContain("validate_dance_note_team");
  });

  it("provides bounded transactional mutation RPCs", () => {
    expect(sql).toContain("reorder_setlist_songs");
    expect(sql).toContain("add_setlist_songs");
    expect(sql).toContain("delete_setlist_cascade");
    expect(sql).toContain("delete_event_cascade");
    expect(sql).toContain("delete_song_cascade");
    expect(sql).toContain("mark_channel_messages_read");
    expect(sql).toContain("jsonb_array_length");
  });

  it("records starter-song provenance", () => {
    expect(sql).toContain("add column if not exists seed_source text");
    expect(sql).toContain("starter-library-v1");
  });

  it("restores event recurrence columns used by the website contract", () => {
    expect(sql).toContain("add column if not exists recurrence_rule");
    expect(sql).toContain("add column if not exists recurrence_parent_id");
    expect(sql).toContain("events_recurrence_parent_id_fkey");
  });

  it("keeps presentation media private and team-readable", () => {
    expect(sql).toContain("update storage.buckets");
    expect(sql).toContain("set public = false");
    expect(sql).toContain("can_read_presentation_media");
    expect(sql).toContain("team members can read presentation media");
  });
});
