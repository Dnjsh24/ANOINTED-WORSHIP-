import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getCurrentTeamContextForClient } from "@/lib/supabase/team-context";
import type { Database } from "@/lib/supabase/database.types";

describe("parallel authenticated team context reads", () => {
  it("starts the pending-request lookup before membership returns, retaining caller and active filters", async () => {
    const membership = Promise.withResolvers<Response>();
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("team_members")) return membership.promise;
      if (url.pathname.endsWith("join_requests")) return new Response(JSON.stringify({ id: "pending" }));
      throw new Error("Unexpected network request");
    });
    const client = createClient<Database>("https://supabase.example.test", "test-key", { global: { fetch }, auth: { persistSession: false } });
    vi.spyOn(client.auth, "getUser").mockResolvedValue({ data: { user: {
      id: "verified-user", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "2026-10-06T00:00:00Z",
    } }, error: null });
    const pendingContext = getCurrentTeamContextForClient(client);
    await vi.waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).includes("join_requests"))).toBe(true));
    const membershipUrl = new URL(String(fetch.mock.calls.find(([input]) => String(input).includes("team_members"))?.[0]));
    expect(membershipUrl.searchParams.get("profile_id")).toBe("eq.verified-user");
    expect(membershipUrl.searchParams.get("status")).toBe("eq.active");
    const requestUrl = new URL(String(fetch.mock.calls.find(([input]) => String(input).includes("join_requests"))?.[0]));
    expect(requestUrl.searchParams.get("profile_id")).toBe("eq.verified-user");
    expect(requestUrl.searchParams.get("status")).toBe("eq.pending");
    membership.resolve(new Response(JSON.stringify({
      id: "member", team_id: "team", role: "owner", custom_role_id: null, teams: { name: "Current team", code: "TM-10000" },
    })));
    await expect(pendingContext).resolves.toMatchObject({ userId: "verified-user", teamId: "team", canManageMembers: true, hasPendingJoinRequest: true });
  });
});
