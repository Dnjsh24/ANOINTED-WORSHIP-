import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { woolyTours } from "@/lib/domain/wooly";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261009010000_wooly_tutorial_progress.sql"), "utf8");
const pageSql = readFileSync(join(process.cwd(), "supabase/migrations/20261011010000_wooly_page_guides.sql"), "utf8");
const taskSql = readFileSync(join(process.cwd(), "supabase/migrations/20261011030000_wooly_feature_tasks.sql"), "utf8");
describe("Wooly checkpoint database boundary", () => {
  it("restricts each operation to the authenticated owner without requiring team membership", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("grant select, insert, update on public.wooly_tutorial_progress to authenticated");
    expect(sql.match(/profile_id = \(select auth.uid\(\)\)/g)).toHaveLength(4);
    expect(sql).not.toMatch(/create policy[^;]+for delete/);
    expect(sql).not.toContain("team_members");
  });
  it("atomically preserves terminal progress, ignores invitation races, and prevents key takeover", () => {
    expect(sql).toContain("primary key (profile_id, tour_id, version)");
    expect(sql).toContain("old.status in ('skipped', 'completed')");
    expect(sql).toContain("new.status = 'offered' and old.status <> 'offered'");
    expect(sql).toContain("return old;");
    expect(sql).toContain("before insert or update");
    expect(sql).toContain("Tutorial checkpoint identity cannot change");
    expect(sql).toContain("set search_path = ''");
  });
  it("constrains version, status, and every catalog step", () => {
    expect(sql).toContain("check (version = 1)");
    for (const [tourId, tour] of Object.entries(woolyTours)) {
      const clause = taskSql.split("\n").find((line) => line.includes(`tour_id = '${tourId}'`));
      expect(clause).toBeDefined();
      for (const step of tour.steps) expect(clause).toContain(`'${step.id}'`);
    }
  });
  it("extends the check in a forward migration without replacing owner policies or terminal protection", () => {
    expect(pageSql).toContain("drop constraint wooly_tutorial_valid_step");
    expect(pageSql).toContain("add constraint wooly_tutorial_valid_step check");
    expect(pageSql).not.toMatch(/drop (table|policy|trigger)|disable row level security|grant |delete from|update public/i);
    expect(taskSql).toContain("add constraint wooly_tutorial_valid_step check");
    expect(taskSql).not.toMatch(/drop (table|policy|trigger)|disable row level security|grant |delete from|update public|truncate/i);
    for (const oldClause of pageSql.split("\n").filter((line) => line.includes("tour_id = "))) expect(taskSql).toContain(oldClause);
  });
});
