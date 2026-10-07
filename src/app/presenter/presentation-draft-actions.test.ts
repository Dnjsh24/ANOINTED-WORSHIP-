import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  desktop: false, client: vi.fn(), context: vi.fn(), rpc: vi.fn(), desktopSave: vi.fn(),
}));
vi.mock("@/lib/desktop/runtime", () => ({ isDesktopRuntime: () => mocks.desktop }));
vi.mock("@/lib/desktop/workspace", () => ({ saveDesktopPresenterDraft: mocks.desktopSave }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: mocks.context }));
import { savePresenterDraftAction } from "./presentation-draft-actions";

const setlistId = "11111111-1111-4111-8111-111111111111";
const teamId = "22222222-2222-4222-8222-222222222222";
const settings = { linesPerSlide: 4, settings: { fontSize: 40 }, slideOverrides: {} };

beforeEach(() => {
  vi.clearAllMocks(); mocks.desktop = false;
  mocks.context.mockResolvedValue({ teamId });
  mocks.rpc.mockResolvedValue({ data: 2, error: null });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
});

describe("Presenter draft persistence boundary", () => {
  it("uses the checked RPC without requiring raw table write access", async () => {
    expect(await savePresenterDraftAction(setlistId, settings)).toEqual({ saved: true, offline: false });
    expect(mocks.rpc).toHaveBeenCalledWith("save_setlist_presentation_settings", { p_team_id: teamId, p_setlist_id: setlistId, p_settings: settings });
  });

  it("reports a safe failure for a denied foreign or deleted parent and leaves the supplied draft intact", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Private database detail" } });
    const draft = structuredClone(settings);
    await expect(savePresenterDraftAction(setlistId, draft)).rejects.toThrow("Keep your changes");
    expect(draft).toEqual(settings);
  });

  it.each([null, [], "text", { invalid: undefined }])("rejects a non-JSON object before database access: %j", async draft => {
    await expect(savePresenterDraftAction(setlistId, draft)).rejects.toThrow("invalid");
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("rejects oversized drafts before authentication or database access", async () => {
    await expect(savePresenterDraftAction(setlistId, { text: "x".repeat(2_000_001) })).rejects.toThrow("too large");
    expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.client).not.toHaveBeenCalled();
  });

  it("keeps the existing desktop persistence path", async () => {
    mocks.desktop = true;
    expect(await savePresenterDraftAction(setlistId, settings)).toEqual({ saved: true, offline: true });
    expect(mocks.desktopSave).toHaveBeenCalledWith(teamId, setlistId, settings);
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
