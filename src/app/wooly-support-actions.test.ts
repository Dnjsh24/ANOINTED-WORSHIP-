import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), support: vi.fn() }));
vi.mock("@/lib/server/wooly-context", () => ({ requireWoolyAccount: mocks.account, requireWoolySupport: mocks.support }));
import { listMyWoolyRequestsAction, listWoolySupportInboxAction, readWoolyThreadAction, replyWoolyThreadAction, saveWoolyHelpArticleAction, setWoolyRequestStatusAction, submitWoolyRequestAction } from "./wooly-support-actions";
const id = "8a06a13c-ea9a-48ee-bf80-a0772a1883c6";
const other = "7a06a13c-ea9a-48ee-bf80-a0772a1883c6";
function database() {
  const rpc = vi.fn().mockResolvedValue({ data: id, error: null });
  const filters: unknown[][] = [];
  const result = { data: [] as object[] | object | null, error: null as object | null };
  const query = { then: (resolve: (data: unknown) => unknown) => Promise.resolve(result).then(resolve) } as Record<string, unknown>;
  for (const method of ["select", "eq", "order", "limit", "range"]) query[method] = (...args: unknown[]) => { filters.push([method, ...args]); return query; };
  query.maybeSingle = () => Promise.resolve(result);
  return { client: { rpc, from: vi.fn(() => query) }, context: { userId: "a", teamId: "team-a" as string | null }, filters, result };
}
let db: ReturnType<typeof database>;
beforeEach(() => { vi.resetAllMocks(); db = database(); mocks.account.mockResolvedValue(db); mocks.support.mockResolvedValue(db); });
describe("private support action boundaries", () => {
  it("submits only the reviewed fields and verified team; sanitizes page path", async () => {
    expect(await submitWoolyRequestAction({ id, question: " Help ", details: "Details", pagePath: "/dashboard?private", history: ["secret"], profileId: "b", teamId: "b" })).toEqual({ ok: true, data: id });
    expect(db.client.rpc).toHaveBeenCalledWith("create_wooly_support_request", { p_id: id, p_question: "Help", p_details: "Details", p_page_path: "/", p_team_id: "team-a" });
    expect(mocks.account).toHaveBeenCalledWith("submit", 5);
  });
  it("allows an authenticated pre-team submission", async () => {
    db.context.teamId = null;
    await submitWoolyRequestAction({ id, question: "Help", details: "", pagePath: "/pending" });
    expect(db.client.rpc).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ p_team_id: null }));
  });
  it("keeps failed saves as failures, including unavailable schema", async () => {
    db.client.rpc.mockResolvedValue({ data: null, error: { message: "missing" } });
    expect(await submitWoolyRequestAction({ id, question: "Help", details: "", pagePath: "/" })).toMatchObject({ ok: false });
  });
  it("validates submission/reply/route/status IDs before any access", async () => {
    expect(await submitWoolyRequestAction({})).toMatchObject({ ok: false });
    expect(await readWoolyThreadAction("forged")).toMatchObject({ ok: false });
    expect(await replyWoolyThreadAction({ id, requestId: id, body: "" })).toMatchObject({ ok: false });
    expect(await setWoolyRequestStatusAction(id, "answered")).toMatchObject({ ok: false });
    expect(await listWoolySupportInboxAction("bogus" as "open")).toMatchObject({ ok: false });
    expect(mocks.account).not.toHaveBeenCalled(); expect(mocks.support).not.toHaveBeenCalled();
  });
  it("filters the personal list and derives support status on the server", async () => {
    db.client.rpc.mockResolvedValue({ data: true, error: null });
    expect(await listMyWoolyRequestsAction()).toMatchObject({ ok: true, data: { isSupport: true, requests: [] } });
    expect(db.filters).toContainEqual(["eq", "profile_id", "a"]);
  });
  it("does not accept support impersonation", async () => {
    mocks.support.mockRejectedValue(new Error("not support"));
    expect(await replyWoolyThreadAction({ id, requestId: other, body: "fake", asSupport: true })).toMatchObject({ ok: false });
    expect(await readWoolyThreadAction(other, true)).toMatchObject({ ok: false });
    expect(await listWoolySupportInboxAction()).toMatchObject({ ok: false });
    expect(db.client.rpc).not.toHaveBeenCalled();
  });
  it("personal reads constrain forged request IDs and refuse missing records", async () => {
    db.result.data = null;
    expect(await readWoolyThreadAction(other)).toMatchObject({ ok: false });
    expect(db.filters).toContainEqual(["eq", "profile_id", "a"]);
    expect(db.filters).toContainEqual(["eq", "id", other]);
  });
  it("replies use the supplied retry ID through the authorized RPC", async () => {
    expect(await replyWoolyThreadAction({ id, requestId: other, body: "Hello" })).toMatchObject({ ok: true });
    expect(db.client.rpc).toHaveBeenCalledWith("reply_wooly_support", { p_request_id: other, p_id: id, p_body: "Hello", p_as_support: false });
  });
  it("changes status through an authenticated account or dedicated support", async () => {
    await setWoolyRequestStatusAction(id, "closed");
    await setWoolyRequestStatusAction(id, "open", true);
    expect(mocks.support).toHaveBeenCalled();
    expect(db.client.rpc).toHaveBeenCalledWith("set_wooly_support_status", { p_id: id, p_status: "closed" });
  });
  it("sorts the support queue oldest first and loads articles privately", async () => {
    expect(await listWoolySupportInboxAction("answered")).toMatchObject({ ok: true });
    expect(db.filters).toContainEqual(["eq", "status", "answered"]);
    expect(db.filters).toContainEqual(["order", "created_at"]);
    expect(db.client.from).not.toHaveBeenCalledWith("songs");
  });
  it("requires support for separate draft/publish and permits only static website links", async () => {
    const article = { id, title: "Help", keywords: "help website", answer: "Prepared reply", audience: "everyone", route: "/songs", published: false };
    expect(await saveWoolyHelpArticleAction({ ...article, route: `/songs/${other}` })).toMatchObject({ ok: false });
    expect(await saveWoolyHelpArticleAction(article)).toMatchObject({ ok: true });
    expect(db.client.rpc).toHaveBeenLastCalledWith("save_wooly_help_article", expect.objectContaining({ p_published: false }));
    await saveWoolyHelpArticleAction({ ...article, published: true });
    expect(db.client.rpc).toHaveBeenLastCalledWith("save_wooly_help_article", expect.objectContaining({ p_published: true }));
    mocks.support.mockRejectedValue(new Error("no"));
    expect(await saveWoolyHelpArticleAction(article)).toMatchObject({ ok: false });
  });
  it("rejects unauthenticated/rate-limited operations", async () => {
    mocks.account.mockRejectedValue(new Error("auth"));
    expect(await listMyWoolyRequestsAction()).toMatchObject({ ok: false });
    expect(await replyWoolyThreadAction({ id, requestId: other, body: "Hello" })).toMatchObject({ ok: false });
    expect(await setWoolyRequestStatusAction(id, "closed")).toMatchObject({ ok: false });
  });
  it("reports session loss explicitly and validates pagination", async () => {
    expect(await listMyWoolyRequestsAction(-1)).toMatchObject({ ok: false });
    mocks.account.mockRejectedValue(Object.assign(new Error("Sign in required"), { code: "session" }));
    expect(await listMyWoolyRequestsAction()).toMatchObject({ ok: false, code: "session" });
  });
  it("rejects a submit/reply draft from a previous account before saving", async () => {
    expect(await submitWoolyRequestAction({ id, question: "Old draft", details: "", pagePath: "/profile", expectedProfileId: other })).toMatchObject({ ok: false, code: "session" });
    expect(await replyWoolyThreadAction({ id, requestId: other, body: "Old reply", expectedProfileId: other })).toMatchObject({ ok: false, code: "session" });
    expect(db.client.rpc).not.toHaveBeenCalled();
  });
  it("reads only the fetched snapshot and orders the latest replies chronologically", async () => {
    const row = { id, profile_id: "a", created_at: "2026-10-01", requester_read_at: "2026-10-01", support_updated_at: "2026-10-11T04:00:00Z" };
    db.result.data = row;
    const messages = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ id: "new" }, { id: "old" }], error: null }) };
    const requestQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }) };
    db.client.from.mockReset().mockReturnValueOnce(requestQuery).mockReturnValueOnce(messages);
    const result = await readWoolyThreadAction(id);
    expect(result).toMatchObject({ ok: true, data: { messages: [{ id: "old" }, { id: "new" }] } });
    expect(db.client.rpc).toHaveBeenCalledWith("read_wooly_support_request", { p_id: id, p_read_until: row.support_updated_at });
    expect(requestQuery.eq).toHaveBeenCalledWith("profile_id", "a");
  });
});
