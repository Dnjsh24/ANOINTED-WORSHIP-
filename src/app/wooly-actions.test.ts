import { beforeEach, describe, expect, it, vi } from "vitest";
import { readTutorialProgressAction, saveTutorialProgressAction } from "./wooly-actions";

const mocks = vi.hoisted(() => ({ create: vi.fn(), user: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), upsert: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.create }));
const checkpoint = { tourId: "joining", version: 1, status: "paused", nextStep: "code" };
const row = { profile_id: "actor", tour_id: "joining", version: 1, status: "paused", next_step: "code", updated_at: "2026-10-09T00:00:00Z" };

describe("Wooly personal progress actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.create.mockResolvedValue({ auth: { getUser: mocks.user }, from: mocks.from });
    mocks.user.mockResolvedValue({ data: { user: { id: "actor" } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select, upsert: mocks.upsert });
    mocks.select.mockReturnValue({ eq: mocks.eq, single: mocks.single });
    mocks.upsert.mockReturnValue({ select: mocks.select });
    mocks.eq.mockResolvedValue({ data: [row], error: null });
    mocks.single.mockResolvedValue({ data: row, error: null });
  });

  it("rejects malformed input before touching authentication or persistence", async () => {
    for (const input of [null, {}, { ...checkpoint, version: 2 }, { ...checkpoint, nextStep: "finish" }, { ...checkpoint, status: "reset" }]) {
      expect(await saveTutorialProgressAction(input)).toMatchObject({ ok: false });
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("denies anonymous reads and writes", async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    expect(await readTutorialProgressAction()).toMatchObject({ ok: false });
    expect(await saveTutorialProgressAction(checkpoint)).toMatchObject({ ok: false });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("uses only the authenticated actor, including before team membership exists", async () => {
    expect(await saveTutorialProgressAction({ ...checkpoint, profile_id: "victim" })).toMatchObject({ ok: true });
    expect(mocks.upsert).toHaveBeenCalledWith({ profile_id: "actor", tour_id: "joining", version: 1, status: "paused", next_step: "code" }, { onConflict: "profile_id,tour_id,version" });
    expect(await readTutorialProgressAction()).toMatchObject({ ok: true, progress: [{ ...checkpoint, updatedAt: row.updated_at }] });
    expect(mocks.eq).toHaveBeenCalledWith("profile_id", "actor");
  });

  it("returns the preserved database terminal checkpoint after stale writes", async () => {
    mocks.single.mockResolvedValue({ data: { ...row, status: "completed", next_step: "request" }, error: null });
    expect(await saveTutorialProgressAction(checkpoint)).toMatchObject({ ok: true, progress: { status: "completed", nextStep: "request" } });
  });

  it("fails safely for unavailable configuration, migration, network, and malformed rows", async () => {
    mocks.create.mockRejectedValueOnce(new Error("private configuration"));
    expect(await readTutorialProgressAction()).toMatchObject({ ok: false });
    mocks.single.mockResolvedValueOnce({ data: null, error: { message: "relation absent" } });
    expect(await saveTutorialProgressAction(checkpoint)).toMatchObject({ ok: false });
    mocks.eq.mockRejectedValueOnce(new Error("offline"));
    expect(await readTutorialProgressAction()).toMatchObject({ ok: false });
    mocks.single.mockResolvedValueOnce({ data: { ...row, next_step: "injected" }, error: null });
    expect(await saveTutorialProgressAction(checkpoint)).toMatchObject({ ok: false });
  });
});
