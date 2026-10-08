import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), context: vi.fn(), env: vi.fn(() => true), revalidate: vi.fn(), query: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: mocks.context }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: mocks.env }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.query }) }));
import { loadSharedEditRequestsAction, reviewSharedEditRequestAction, submitSharedEditRequestAction, withdrawSharedEditRequestAction } from "./edit-request-actions";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = { targetType: "song", targetId: id(1), revision: 2, changes: { title: "Correction" }, reason: "Typo", requestNonce: id(2) };
beforeEach(() => {
  vi.clearAllMocks(); mocks.env.mockReturnValue(true);
  mocks.context.mockResolvedValue({ userId: id(3), memberId: id(4), teamId: id(5), role: "member" });
  mocks.rpc.mockResolvedValue({ data: id(6), error: null });
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { status: "pending" }, error: null }) };
  mocks.query.mockReturnValue(query);
});
describe("shared request server actions", () => {
  it("loads the review queue for an owner even when mine is requested", async () => {
    mocks.context.mockResolvedValue({ userId: id(3), memberId: id(4), teamId: id(5), role: "owner" });
    const filters: unknown[][] = [];
    const query = {
      select: () => query, eq: (...args: unknown[]) => { filters.push(args); return query; },
      neq: (...args: unknown[]) => { filters.push(["neq", ...args]); return query; },
      order: () => query, limit: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    mocks.query.mockReturnValue(query);
    expect((await loadSharedEditRequestsAction({ view: "mine" })).ok).toBe(true);
    expect(filters).toContainEqual(["team_id", id(5)]);
    expect(filters).toContainEqual(["status", "pending"]);
    expect(filters).toContainEqual(["neq", "requested_by", id(3)]);
    expect(filters).not.toContainEqual(["requested_by", id(3)]);
  });
  it("allows a member proposal and sends no caller-selected team or actor", async () => {
    expect((await submitSharedEditRequestAction(input)).data?.requestId).toBe(id(6));
    expect(mocks.rpc).toHaveBeenCalledWith("submit_shared_edit_request", { p_target_type: "song", p_target_id: id(1), p_revision: 2, p_changes: { title: "Correction" }, p_reason: "Typo", p_request_nonce: id(2) });
  });
  it("rejects forged actor/team, receipt fields and missing rejection reason before RPC", async () => {
    expect((await submitSharedEditRequestAction({ ...input, teamId: id(99) })).ok).toBe(false);
    expect((await submitSharedEditRequestAction({ ...input, changes: { read_at: null } })).ok).toBe(false);
    expect((await reviewSharedEditRequestAction({ requestId: id(6), decision: "rejected", reason: " " })).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves nonce on retry and does not invalidate published documents on failed submission", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("Network unavailable"));
    const failed = await submitSharedEditRequestAction(input);
    expect(failed.ok).toBe(false); expect(failed.message).toContain("same request identifier");
    expect(mocks.revalidate).not.toHaveBeenCalled();
    await submitSharedEditRequestAction(input);
    expect(mocks.rpc.mock.calls[0][1].p_request_nonce).toBe(mocks.rpc.mock.calls[1][1].p_request_nonce);
    expect(mocks.revalidate).toHaveBeenCalledTimes(1);
    expect(mocks.revalidate).toHaveBeenCalledWith("/requests");
  });
  it("reports stale approval as retained proposal and only refreshes the queue", async () => {
    mocks.rpc.mockResolvedValue({ data: "needs_revision", error: null });
    const result = await reviewSharedEditRequestAction({ requestId: id(6), decision: "approved", reason: "" });
    expect(result.ok).toBe(false); expect(result.data?.status).toBe("needs_revision");
    expect(result.message).toContain("retained"); expect(mocks.revalidate).toHaveBeenCalledTimes(1);
  });
  it("reports a stored stale submission as unsuccessful so its draft and reason remain visible", async () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { status: "needs_revision" }, error: null }) };
    mocks.query.mockReturnValue(query);
    const result = await submitSharedEditRequestAction(input);
    expect(result.ok).toBe(false); expect(result.data).toEqual({ requestId: id(6), status: "needs_revision" });
    expect(result.message).toContain("proposal and reason are retained");
  });
  it("leaves DB permission denial explicit and returns no fabricated success in demo mode", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await withdrawSharedEditRequestAction({ requestId: id(6) })).ok).toBe(false);
    mocks.env.mockReturnValue(false);
    expect((await submitSharedEditRequestAction(input)).ok).toBe(false);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects unsafe pagination cursor syntax before querying", async () => {
    expect((await loadSharedEditRequestsAction({ view: "mine", cursor: { requestedAt: "now),id.gt.fake", id: id(6) } })).ok).toBe(false);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("pages tied timestamps by id and uses the last visible row for the next cursor", async () => {
    const requestedAt = "2026-10-06T09:00:00.000+00:00";
    const row = (n: number) => ({ id: id(n), team_id: id(5), target_type: "song", target_id: id(1), base_revision: 2, changes: { title: "Proposal" }, before_snapshot: { title: "Song" }, after_snapshot: null, reason: "Typo", status: "pending", requested_by: id(3), reviewed_by: null, review_reason: null, requested_at: requestedAt, reviewed_at: null, request_nonce: id(n + 10), legacy_song_request_id: null });
    const or = vi.fn(); const limit = vi.fn(); const filters: unknown[][] = [];
    const query = {
      select: () => query, eq: (...args: unknown[]) => { filters.push(args); return query; }, neq: () => query,
      order: () => query, limit: (size: number) => { limit(size); return query; }, or: (value: string) => { or(value); return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [row(9), row(8), row(7)], error: null }).then(resolve),
    };
    mocks.query.mockReturnValue(query);
    const result = await loadSharedEditRequestsAction({ view: "mine", limit: 2, cursor: { requestedAt, id: id(10) } });
    expect(result).toMatchObject({ ok: true, requests: [{ id: id(9) }, { id: id(8) }], nextCursor: { requestedAt, id: id(8) } });
    expect(limit).toHaveBeenCalledWith(3);
    expect(or).toHaveBeenCalledWith(`requested_at.lt.${requestedAt},and(requested_at.eq.${requestedAt},id.lt.${id(10)})`);
    expect(filters).toContainEqual(["team_id", id(5)]); expect(filters).toContainEqual(["requested_by", id(3)]);
  });
});
