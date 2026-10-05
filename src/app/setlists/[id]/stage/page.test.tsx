import { beforeEach, describe, expect, it, vi } from "vitest";
import StagePage from "./page";

const mocks = vi.hoisted(() => ({ connected: false, client: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => mocks.connected }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: async () => ({ teamId: "team", userId: "profile" }) }));
vi.mock("./stage-mode-client", () => ({ default: () => null }));

describe("Stage mode route", () => {
  beforeEach(() => { mocks.connected = false; mocks.client.mockReset(); });
  it("opens the correct demo setlist and retains its assigned key", async () => {
    const page = await StagePage({ params: Promise.resolve({ id: "sunday-service" }) });
    expect(page.props.setlist.id).toBe("sunday-service");
    expect(page.props.setlist.songs.length).toBeGreaterThan(0);
    expect(page.props.setlist.songs[0].assignedKey).toBe("B");
    expect(page.props.setlist.songs[0].song.lyricsChords).not.toBe("");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("never substitutes another demo setlist for an unknown ID", async () => {
    await expect(StagePage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NOT_FOUND");
  });
  it("scopes connected lookups and distinguishes query failure from missing sets", async () => {
    mocks.connected = true;
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: "private backend details" } }) };
    mocks.client.mockResolvedValue({ from: () => query });
    await expect(StagePage({ params: Promise.resolve({ id: "set" }) })).rejects.toThrow("Stage mode could not load. Please retry.");
    expect(query.eq).toHaveBeenCalledWith("team_id", "team");
    expect(query.eq).toHaveBeenCalledWith("id", "set");
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(StagePage({ params: Promise.resolve({ id: "other-team-set" }) })).rejects.toThrow("NOT_FOUND");
  });
});
