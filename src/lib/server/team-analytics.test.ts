import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { loadTeamAnalytics } from "@/lib/server/team-analytics";

const summary = { mostPlayedSongs: [{ title: "Opening", count: 1200 }], attendanceStats: [{ type: "service", rate: 50 }], mostActiveChannels: [{ name: "Team", count: 1250 }] };
function clientWithFetch(fetch: (input: RequestInfo | URL) => Promise<Response>) {
  return createClient<Database>("https://supabase.example.test", "test-key", { global: { fetch }, auth: { persistSession: false } });
}

describe("compact caller-scoped team analytics", () => {
  it("loads complete aggregate counts in one RPC without occurrence-row transfers", async () => {
    const fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>().mockResolvedValue(new Response(JSON.stringify(summary)));
    expect(await loadTeamAnalytics(clientWithFetch(fetch), "team-1")).toEqual(summary);
    expect(fetch).toHaveBeenCalledOnce();
    expect(String(fetch.mock.calls[0]?.[0])).toContain("/rpc/get_team_analytics");
  });

  it.each(["42501", "PGRST000", "57014"])("does not fall back or fabricate zero statistics for %s", async code => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ code, message: "Unavailable" }), { status: 403 }));
    await expect(loadTeamAnalytics(clientWithFetch(fetch), "team-1")).rejects.toThrow("could not be loaded");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each(["PGRST202", "42883"])("retains the previous RLS-scoped reads during %s rollout", async code => {
    const pending = Promise.withResolvers<Response>();
    const urls: URL[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input)); urls.push(url);
      if (url.pathname.includes("/rpc/")) return new Response(JSON.stringify({ code, message: "Not installed" }), { status: 404 });
      if (url.pathname.endsWith("setlist_songs")) return pending.promise;
      if (url.pathname.endsWith("events")) return new Response(JSON.stringify([{ type: "service", attendance: [{ status: "available" }, { status: "unavailable" }] }]));
      if (url.pathname.endsWith("messages")) return new Response(JSON.stringify([{ channel_id: "channel", message_channels: { name: "Team" } }]));
      throw new Error("Unexpected read");
    });
    const loading = loadTeamAnalytics(clientWithFetch(fetch), "team-1");
    await vi.waitFor(() => expect(urls).toHaveLength(4));
    const songs = urls.find(url => url.pathname.endsWith("setlist_songs"));
    expect(songs?.searchParams.get("setlists.team_id")).toBe("eq.team-1");
    expect(songs?.searchParams.get("limit")).toBe("1000");
    expect(urls.find(url => url.pathname.endsWith("events"))?.searchParams.get("team_id")).toBe("eq.team-1");
    expect(urls.find(url => url.pathname.endsWith("messages"))?.searchParams.get("message_channels.team_id")).toBe("eq.team-1");
    expect(urls.find(url => url.pathname.endsWith("messages"))?.searchParams.get("created_at")).toMatch(/^gte\./);
    pending.resolve(new Response(JSON.stringify([{ song_id: "song", songs: { title: "Opening" } }])));
    expect(await loading).toEqual({ mostPlayedSongs: [{ title: "Opening", count: 1 }], attendanceStats: [{ type: "service", rate: 50 }], mostActiveChannels: [{ name: "Team", count: 1 }] });
  });

  it("rejects malformed aggregate data rather than showing invented empty values", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ mostPlayedSongs: [] })));
    await expect(loadTeamAnalytics(clientWithFetch(fetch), "team-1")).rejects.toThrow();
  });
});
