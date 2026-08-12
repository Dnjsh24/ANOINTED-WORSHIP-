import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
const migrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith("_move_privileged_rpcs_to_private_schema.sql"),
);
const sql = migrationName
  ? readFileSync(join(migrationsDirectory, migrationName), "utf8").toLowerCase()
  : "";

const privilegedRpcSignatures = [
  "add_setlist_songs(uuid, jsonb)",
  "claim_worship_remote_pairing(uuid, text)",
  "claim_worship_remote_pairing_by_pin(text)",
  "create_team_workspace(text, text, text, time, time)",
  "create_worship_remote_pairing(uuid)",
  "delete_event_cascade(uuid)",
  "delete_setlist_cascade(uuid)",
  "delete_song_cascade(uuid)",
  "leave_team_workspace(uuid)",
  "mark_channel_messages_read(uuid, uuid[])",
  "reorder_setlist_songs(uuid, jsonb)",
  "resume_worship_remote_pairing(uuid)",
  "review_join_request(uuid, text)",
  "revoke_worship_remote_pairing(uuid)",
  "transfer_team_ownership(uuid, uuid)",
];

describe("privileged RPC security boundary migration", () => {
  it("moves every elevated implementation out of the exposed public schema", () => {
    expect(migrationName).toBeTruthy();
    for (const signature of privilegedRpcSignatures) {
      expect(sql).toContain(`alter function public.${signature} set schema private`);
      expect(sql).toContain(`revoke all on function private.${signature}`);
      expect(sql).toContain(`grant execute on function private.${signature} to authenticated`);
    }
  });

  it("keeps the existing public RPC contract through invoker-only facades", () => {
    expect(sql.match(/security invoker/g)).toHaveLength(privilegedRpcSignatures.length);
    expect(sql.match(/set search_path = ''/g)).toHaveLength(
      privilegedRpcSignatures.length * 2,
    );
    expect(sql.match(/grant execute on function public\./g)).toHaveLength(
      privilegedRpcSignatures.length * 2,
    );
    expect(sql).not.toContain("security definer");
  });

  it("does not expose either layer to anonymous callers", () => {
    expect(sql.match(/revoke all on function private\./g)).toHaveLength(
      privilegedRpcSignatures.length,
    );
    expect(sql.match(/revoke all on function public\./g)).toHaveLength(
      privilegedRpcSignatures.length,
    );
    expect(sql.match(/from public, anon, authenticated/g)).toHaveLength(
      privilegedRpcSignatures.length * 2,
    );
  });
});
