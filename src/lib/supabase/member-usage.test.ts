import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { loadMemberUsageDays, loadMemberUsageStates } from "@/lib/supabase/member-usage";

describe("team-scoped member usage reads", () => {
  it("paginates daily results and sends team plus UTC date filters", async () => {
    const row = { member_id: "member", team_id: "team", usage_date: "2026-10-05", active_minutes: 1, sessions: 1 };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 1000 }, () => row))))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ ...row, member_id: "last-member" }])));
    const client = createClient<Database>("http://localhost:54321", "test-key", { global: { fetch }, auth: { persistSession: false } });
    const result = await loadMemberUsageDays(client, "team", "2026-10-01", "2026-10-05");
    expect(result.kind === "ready" && result.rows.length).toBe(1001);
    expect(fetch).toHaveBeenCalledTimes(2);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get("team_id")).toBe("eq.team");
    expect(url.searchParams.getAll("usage_date")).toEqual(["gte.2026-10-01", "lte.2026-10-05"]);
    expect(new URL(String(fetch.mock.calls[1][0])).searchParams.get("offset")).toBe("1000");
  });
  it("reports missing schema without treating it as zero usage", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "PGRST205", message: "table missing" }), { status: 404 }));
    const client = createClient<Database>("http://localhost:54321", "test-key", { global: { fetch }, auth: { persistSession: false } });
    const result = await loadMemberUsageStates(client, "team");
    expect(result).toEqual({ kind: "unavailable", message: "Usage tracking is unavailable until the member usage migration is deployed." });
  });
});
