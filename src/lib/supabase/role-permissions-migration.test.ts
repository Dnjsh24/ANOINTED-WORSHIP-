import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
const migrationName = readdirSync(migrationsDirectory).find((name) =>
  name.endsWith("_team_role_permissions.sql"),
);
const sql = migrationName
  ? readFileSync(join(migrationsDirectory, migrationName), "utf8").toLowerCase()
  : "";

describe("team role permissions migration", () => {
  it("creates a team-scoped policy table with explicit Data API grants and RLS", () => {
    expect(sql).toContain("create table public.team_role_permissions");
    expect(sql).toContain("unique (team_id, role)");
    expect(sql).toContain("alter table public.team_role_permissions enable row level security");
    expect(sql).toContain("grant select, insert, update, delete on public.team_role_permissions to authenticated");
  });

  it("allows active members to read and only the team owner to mutate policies", () => {
    expect(sql).toContain("private.is_approved_member(team_id)");
    expect(sql).toContain("private.is_team_owner(team_id)");
    expect(sql).toContain("with check");
    expect(sql).not.toContain("to anon");
  });

  it("prevents the owner role from being overridden", () => {
    expect(sql).toContain("role <> 'owner'");
  });
});
