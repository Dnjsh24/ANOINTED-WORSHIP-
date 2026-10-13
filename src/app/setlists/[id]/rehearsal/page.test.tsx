import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: vi.fn(), context: vi.fn(), client: vi.fn(), load: vi.fn(), shared: vi.fn(), proposal: vi.fn(),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: mocks.env }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/workflow-data", () => ({ loadPreparationWorkspace: mocks.load }));
vi.mock("@/app/workflow-proposals", () => ({ requestRehearsalPlanAction: mocks.proposal }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/shared-preparation", () => ({
  SharedPreparation: (props: unknown) => { mocks.shared(props); return <div>Shared plan</div>; },
}));
import TeamRehearsalPage from "./page";

const workspace = { plan: { revision: 3 }, checks: [], readiness: [], members: [], assignedMemberIds: [] };
function setlistClient(data: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue({ data, error });
  const client = { from: vi.fn().mockReturnValue(query) };
  mocks.client.mockResolvedValue(client);
  return { client, query };
}
const setlist = {
  id: "setlist", name: "Sunday songs", event_id: null,
  setlist_songs: [
    { id: "second", song_order: 2, assigned_key: "D", notes: "Lead: Bea", arrangement: "Quiet intro", song: { title: "Second", original_key: "C", bpm: 90 } },
    { id: "removed", song_order: 3, song: null },
    { id: "first", song_order: 1, assigned_key: "", notes: '{"lead":"Alex"}', arrangement: null, song: { title: "First", original_key: "G", bpm: null } },
  ],
};
const renderPage = (id = "setlist") => TeamRehearsalPage({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.mockReturnValue(true);
  mocks.context.mockResolvedValue({ teamId: "team", userId: "profile", memberId: "member", role: "owner" });
  mocks.load.mockResolvedValue({ ok: true, data: workspace });
});

describe("team rehearsal page", () => {
  it("loads only the selected team's setlist and preserves saved workspace and ordered song slots", async () => {
    const { client, query } = setlistClient(setlist);
    const html = renderToStaticMarkup(await renderPage());
    expect(query.eq.mock.calls).toEqual([["id", "setlist"], ["team_id", "team"]]);
    expect(mocks.load).toHaveBeenCalledWith(client, "team", "setlist", null, ["first", "second"]);
    expect(mocks.shared).toHaveBeenCalledWith(expect.objectContaining({
      setlistId: "setlist", name: "Sunday songs", workspace, memberId: "member", canManage: true,
      songs: [
        { id: "first", title: "First", assignedKey: "G", bpm: null, lead: "Alex", arrangement: null },
        { id: "second", title: "Second", assignedKey: "D", bpm: 90, lead: "Bea", arrangement: "Quiet intro" },
      ],
    }));
    expect(html).toContain('href="/setlists/setlist"');
    expect(html).toContain("Back to setlist");
  });

  it("passes the linked event and supports an empty setlist", async () => {
    const { client } = setlistClient({ ...setlist, event_id: "event", setlist_songs: [] });
    renderToStaticMarkup(await renderPage());
    expect(mocks.load).toHaveBeenCalledWith(client, "team", "setlist", "event", []);
    expect(mocks.shared).toHaveBeenCalledWith(expect.objectContaining({ songs: [] }));
  });

  it.each([
    ["member", undefined, false],
    ["worship_leader", { "setlists.manage": false }, false],
    ["member", { "setlists.manage": true }, true],
  ])("preserves effective manager permissions for %s and binds member proposals", async (role, permissionOverrides, canManage) => {
    mocks.context.mockResolvedValue({ teamId: "team", memberId: "member", role, permissionOverrides });
    setlistClient(setlist);
    renderToStaticMarkup(await renderPage());
    const props = mocks.shared.mock.calls[0][0];
    expect(props.canManage).toBe(canManage);
    const request = { reason: "More time" };
    await props.proposeAction(request);
    expect(mocks.proposal).toHaveBeenCalledWith("setlist", request);
  });

  it("shows planning failures without offering a replacement demo plan", async () => {
    setlistClient(setlist);
    mocks.load.mockResolvedValue({ ok: false, message: "Shared planning unavailable" });
    const html = renderToStaticMarkup(await renderPage());
    expect(html).toContain('role="status"');
    expect(html).toContain("Shared planning unavailable");
    expect(html).not.toContain("Demo plan");
    expect(mocks.shared).not.toHaveBeenCalled();
  });

  it("does not fall back to sample data for missing or cross-team setlists", async () => {
    setlistClient(null);
    await expect(renderPage("sunday-service")).rejects.toThrow("NOT_FOUND");
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("reports setlist query errors before loading preparation", async () => {
    setlistClient(null, { message: "Database down" });
    await expect(renderPage()).rejects.toThrow("could not be loaded");
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("provides a clearly local demo and rejects unknown demo IDs", async () => {
    mocks.env.mockReturnValue(false);
    const html = renderToStaticMarkup(await renderPage("sunday-service"));
    expect(html).toContain("Demo plan: changes stay in this session");
    expect(html).toContain("Download rehearsal plan");
    expect(mocks.client).not.toHaveBeenCalled();
    await expect(renderPage("missing")).rejects.toThrow("NOT_FOUND");
  });
});
