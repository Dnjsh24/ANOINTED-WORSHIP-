import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

const mocks = vi.hoisted(() => ({ client: vi.fn(), role: "owner" }));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/components/offline-preloader", () => ({ OfflinePreloader: () => null }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: async () => ({ userId: "profile", teamId: "team", memberId: "member", role: mocks.role }) }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/desktop/runtime", () => ({ isDesktopRuntime: () => false }));
import DashboardPage from "@/app/dashboard/page";

describe("dashboard request dependencies", () => {
  beforeEach(() => { mocks.role = "owner"; mocks.client.mockReset(); });
  it.each(["owner", "member"])("starts independent summaries early and avoids duplicate %s member/assignment reads", async role => {
    mocks.role = role;
    const profile = Promise.withResolvers<Response>();
    const urls: URL[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)); urls.push(url);
      if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": "*/5" } });
      if (url.pathname.endsWith("profiles")) return profile.promise;
      if (url.pathname.endsWith("events")) return new Response(JSON.stringify({ id: "event", name: "Service", event_date: "2027-01-31", starts_at: "09:00", ends_at: "11:00", location: "Hall", event_assignments: [{ assignment: "Main Keys", team_member_id: "member" }] }));
      if (url.pathname.endsWith("attendance")) return new Response(JSON.stringify({ status: "available" }));
      if (url.pathname.endsWith("setlists")) return new Response("null");
      return new Response("[]", { headers: { "content-range": "*/0" } });
    });
    mocks.client.mockResolvedValue(createClient<Database>("https://supabase.example.test", "test-key", { global: { fetch }, auth: { persistSession: false } }));
    const page = DashboardPage();
    await vi.waitFor(() => expect(urls.some(url => url.pathname.endsWith("notifications"))).toBe(true));
    expect(urls.some(url => url.pathname.endsWith("get_personal_preparation"))).toBe(true);
    profile.resolve(new Response(JSON.stringify({ full_name: "Verified member" })));
    await page;
    expect(urls).toHaveLength(12);
    expect(urls.some(url => url.pathname.endsWith("event_assignments"))).toBe(false);
    const memberQueries = urls.filter(url => url.pathname.endsWith("team_members"));
    expect(memberQueries).toHaveLength(1); // Celebration data only; member ID comes from verified context.
    const event = urls.find(url => url.pathname.endsWith("events") && url.searchParams.has("event_assignments.team_member_id"));
    expect(event?.searchParams.get("team_id")).toBe("eq.team");
    expect(event?.searchParams.get("event_assignments.team_member_id")).toBe("eq.member");
    expect(event?.searchParams.get("select")).not.toContain("*");
    const setlist = urls.find(url => url.pathname.endsWith("setlists") && url.searchParams.has("setlist_date"));
    expect(setlist?.searchParams.get("select")).not.toContain("*");
    const count = urls.find(url => url.pathname.endsWith("attendance") && url.searchParams.get("status") === "eq.available");
    expect(count?.searchParams.get(role === "owner" ? "events.team_id" : "team_member_id")).toBe(role === "owner" ? "eq.team" : "eq.member");
    expect(count?.searchParams.get("event_id")).toBeNull(); // No transferred month event IDs or IN list.
  });
});
