import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), from: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), update: vi.fn(), insert: vi.fn(), proposal: vi.fn(), role: "member", creator: "", saved: true, desktop: false, desktopContext: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => true, getSiteUrl: () => "http://localhost" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/desktop/runtime", () => ({ isDesktopRuntime: () => mocks.desktop }));
vi.mock("@/lib/desktop/workspace", () => ({}));
vi.mock("@/lib/desktop/sync", () => ({}));
vi.mock("@/lib/push-notifications", () => ({ notifyProfiles: vi.fn() }));
vi.mock("@/lib/domain/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/supabase/team-context", () => ({ getCurrentTeamContext: mocks.desktopContext, getCurrentTeamContextForClient: vi.fn() }));
vi.mock("@/app/edit-request-actions", () => ({ submitSharedEditRequestAction: mocks.proposal }));
import { createSongAction, updateSongAction } from "./actions";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1), team = id(2), song = id(3);
const form = () => { const data = new FormData(); for (const [key, value] of Object.entries({ songId: song, title: "Song", artist: "Artist", originalKey: "C", lyrics: "Lyrics", revision: "2", requestNonce: id(5), reason: "Correct lyrics" })) data.set(key, value); return data; };
beforeEach(() => {
  vi.clearAllMocks(); mocks.role = "member"; mocks.creator = actor; mocks.saved = true; mocks.desktop = false;
  mocks.proposal.mockResolvedValue({ ok: true, message: "Request saved", data: { requestId: id(6) } });
  mocks.from.mockImplementation((table: string) => {
    let write = false;
    const query = {
      select: () => query, eq: () => query, is: () => query, order: () => query, limit: () => query,
      update: (values: unknown) => { write = true; mocks.update(values); return query; },
      insert: (values: unknown) => { mocks.insert(values); return query; },
      single: async () => ({ data: { id: song }, error: null }),
      maybeSingle: async () => ({ data: table === "songs" ? (write ? (mocks.saved ? { id: song } : null) : { created_by: mocks.creator, sync_revision: 2 }) : { id: id(4), team_id: team, role: mocks.role, status: "active", teams: { id: team } }, error: null }),
    };
    return query;
  });
  mocks.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: actor } } }) }, from: mocks.from });
});
describe("song ownership actions", () => {
  it("allows active ordinary members to add songs with authenticated creator identity", async () => {
    const input = form(); input.set("created_by", id(99));
    await createSongAction({ ok: false, message: "" }, input);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ created_by: actor, team_id: team, status: "approved" }));
    expect(mocks.redirect).toHaveBeenCalledWith(`/songs/${song}`);
  });
  it("permits the song creator to save directly regardless of ordinary role", async () => {
    expect((await updateSongAction({ ok: false, message: "" }, form())).ok).toBe(true);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ lyrics_chords: "Lyrics" }));
    expect(mocks.proposal).not.toHaveBeenCalled();
  });
  it("makes a leader request owner/admin approval without publishing", async () => {
    mocks.role = "worship_leader"; mocks.creator = id(99);
    const result = await updateSongAction({ ok: false, message: "" }, form());
    expect(result.data?.requestId).toBe(id(6));
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(mocks.proposal).toHaveBeenCalledWith(expect.objectContaining({ targetType: "song", targetId: song, revision: 2, reason: "Correct lyrics", requestNonce: id(5) }));
  });
  it("allows owner/admin direct edits but reports a lost revision instead of fake success", async () => {
    mocks.role = "admin"; mocks.creator = id(99); mocks.saved = false;
    const result = await updateSongAction({ ok: false, message: "" }, form());
    expect(result.ok).toBe(false); expect(result.message).toContain("draft is unchanged"); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("does not trust a cached account's unverifiable creator identity", async () => {
    mocks.desktop = true;
    mocks.desktopContext.mockResolvedValue({ teamId: team, userId: actor, role: "member" });
    const result = await updateSongAction({ ok: false, message: "" }, form());
    expect(result.ok).toBe(false); expect(mocks.update).not.toHaveBeenCalled();
  });
});
