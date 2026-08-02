import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260730063024_harden_website_boundaries.sql"),
  "utf8",
).toLowerCase();
const profileBirthdaySql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260730063114_add_profile_birthday.sql"),
  "utf8",
).toLowerCase();

describe("website security migration", () => {
  it("enables and scopes setlist template RLS", () => {
    expect(sql).toContain("alter table public.setlist_templates enable row level security");
    expect(sql).toContain("active members can read setlist templates");
    expect(sql).toContain("setlist managers can delete setlist templates");
    expect(sql).toContain("private.has_team_role");
  });

  it("scopes presentation-media writes by team and user path", () => {
    expect(sql).toContain("private.can_write_presentation_media(name)");
    expect(sql).toContain("(storage.foldername(object_name))[2] = (select auth.uid())::text");
  });

  it("keeps scheduled delivery service-role-only and atomic", () => {
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("grant execute on function public.deliver_scheduled_messages(integer) to service_role");
    expect(sql).toContain("revoke all on function public.deliver_scheduled_messages(integer) from authenticated");
  });

  it("prevents avatar listing and executes unread counts as the signed-in caller", () => {
    expect(sql).toContain('drop policy if exists "avatars are publicly readable"');
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("where p_profile_id = auth.uid()");
    expect(sql).toContain("revoke all on function public.get_unread_message_count(uuid) from anon");
    expect(sql).toContain("grant execute on function public.get_unread_message_count(uuid) to authenticated");
  });

  it("adds the profile birthday field repeatably for profile editing and celebrations", () => {
    expect(profileBirthdaySql).toContain("alter table public.profiles");
    expect(profileBirthdaySql).toContain("add column if not exists birthday date");
  });
});
