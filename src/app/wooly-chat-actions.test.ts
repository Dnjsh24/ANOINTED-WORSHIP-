import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), account: vi.fn(), records: vi.fn() }));
vi.mock("@/lib/server/wooly-context", () => ({ woolyServerContext: mocks.context, requireWoolyAccount: mocks.account }));
vi.mock("@/lib/server/wooly-records", () => ({ readWoolyRecords: mocks.records }));
import { answerWoolyQuestionAction } from "./wooly-chat-actions";
const input = (question: string) => ({ question, today: "2026-10-11", pagePath: "/dashboard" });
function session(userId: string | null = "a", teamId: string | null = "team-a", articles: object[] | null = []) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: articles, error: articles ? null : {} }) };
  return { client: { from: vi.fn(() => query) }, context: { userId, teamId }, audience: { userId: userId ?? "guest", hasTeam: !!teamId, canManageMembers: false, session: userId ? "account" : "guest" } };
}
beforeEach(() => { vi.resetAllMocks(); mocks.context.mockResolvedValue(session()); mocks.account.mockResolvedValue({}); mocks.records.mockResolvedValue({ kind: "answer", text: "fresh", sources: [] }); });
describe("Wooly question action", () => {
  it("validates before looking up anything", async () => {
    expect((await answerWoolyQuestionAction(input(""))).kind).toBe("unavailable");
    expect(mocks.context).not.toHaveBeenCalled();
  });
  it("asks for ambiguous dates", async () => {
    expect((await answerWoolyQuestionAction(input("Events on 10/11/2026"))).kind).toBe("clarification");
    expect(mocks.records).not.toHaveBeenCalled();
  });
  it("uses verified team context rather than client-supplied team fields", async () => {
    const value = session(); mocks.context.mockResolvedValue(value);
    await answerWoolyQuestionAction({ ...input("Find song Grace"), teamId: "forged" });
    expect(mocks.account).toHaveBeenCalledWith("lookup");
    expect(mocks.records).toHaveBeenCalledWith(value.client, "team-a", expect.objectContaining({ intent: "find-song", term: "Grace" }));
  });
  it.each([[null, null], ["a", null]])("denies record reads without active membership (%s)", async (user, team) => {
    mocks.context.mockResolvedValue(session(user, team));
    expect((await answerWoolyQuestionAction(input("next event"))).kind).toBe("unavailable");
    expect(mocks.records).not.toHaveBeenCalled();
  });
  it("keeps public/prepared answers available before optional migration", async () => {
    mocks.context.mockResolvedValue(session("a", "team-a", null));
    expect((await answerWoolyQuestionAction(input("How do I use setlists?"))).kind).toBe("answer");
    expect((await answerWoolyQuestionAction(input("should I buy a guitar?"))).kind).toBe("unknown");
  });
  it("supports guests without record data", async () => {
    mocks.context.mockResolvedValue(session(null, null));
    expect((await answerWoolyQuestionAction(input("sign in"))).kind).toBe("answer");
  });
  it("returns unavailable on lookup/rate-limit failure", async () => {
    mocks.account.mockRejectedValue(new Error("rate limit"));
    expect((await answerWoolyQuestionAction(input("Find song Grace"))).kind).toBe("unavailable");
    expect(mocks.records).not.toHaveBeenCalled();
  });
  it.each(["Hello", "next event", "events on 2099-01-01", "Find song Opening Song", "Find setlist Sunday", "Songs in setlist Sunday"])("labels sample mode for %s", async (question) => {
    mocks.context.mockResolvedValue(null);
    const reply = await answerWoolyQuestionAction(input(question));
    expect(reply.kind).toBe("answer");
    if (question !== "Hello") expect(reply.text).toContain("Sample data");
    expect(mocks.records).not.toHaveBeenCalled();
  });
});
