import { describe, expect, it } from "vitest";
import { articleVisible, browserCalendarDate, matchPreparedAnswer, matchRecordQuestion, needsWoolyDate, safeWoolyPagePath, supportRequestSchema, unreadSupportRequests, woolyQuestionSchema, type HelpArticle, type SupportRequest, type WoolyQuestion } from "./wooly-chat";

const member = { userId: "a", hasTeam: true, canManageMembers: false, session: "account" as const };
const guest = { ...member, userId: "guest", hasTeam: false, session: "guest" as const };
const question = (text: string): WoolyQuestion => ({ question: text, today: "2026-12-31", pagePath: "/dashboard" });
const article: HelpArticle = { id: "8a06a13c-ea9a-48ee-bf80-a0772a1883c6", title: "Downloading offline charts", keywords: "download offline charts", answer: "Use your chart’s download control.", audience: "everyone", published: true, route: "/songs", created_by: "a", updated_at: "2026-01-01T00:00:00Z" };

describe("Wooly's deterministic answers", () => {
  it.each(["How do I use setlists?", "Where is my profile?", "How do I find the calendar?", "Hello"])("answers prepared question %s", (text) => expect(matchPreparedAnswer(question(text), member).kind).toBe("answer"));
  it.each(["What should my church do?", "Show latest messages", "Find member email", "Show reminders"])("does not invent an answer to %s", (text) => expect(matchPreparedAnswer(question(text), member).kind).toBe("unknown"));
  it("offers topic choices when equally plausible", () => {
    const result = matchPreparedAnswer(question("profile analytics"), { ...member, role: "owner", canManageMembers: true });
    expect(result.kind).toBe("clarification");
    if (result.kind === "clarification") expect(result.choices.length).toBeGreaterThan(1);
  });
  it("rechecks selected topic access", () => {
    expect(matchPreparedAnswer({ ...question("manage members"), choice: { kind: "topic", id: "members" } }, member).kind).toBe("unknown");
    expect(matchPreparedAnswer({ ...question("profile"), choice: { kind: "topic", id: "profile" } }, guest).kind).toBe("unknown");
  });
  it("guests receive public page help", () => expect(matchPreparedAnswer(question("sign in"), guest).kind).toBe("answer"));
  it("only publishes separately approved articles", () => {
    const unpublished = matchPreparedAnswer(question("download offline charts"), member, [{ ...article, published: false }]);
    expect(unpublished.text).not.toBe(article.answer);
    if (unpublished.kind === "clarification") expect(unpublished.choices.some((choice) => choice.value.kind === "topic" && choice.value.id === `article:${article.id}`)).toBe(false);
    expect(matchPreparedAnswer(question("download offline charts"), member, [article])).toMatchObject({ kind: "answer", text: article.answer });
    expect(articleVisible({ ...article, audience: "managers" }, member)).toBe(false);
    expect(articleVisible({ ...article, audience: "team" }, guest)).toBe(false);
    expect(articleVisible({ ...article, audience: "before-team" }, { ...member, hasTeam: false })).toBe(true);
    expect(articleVisible({ ...article, audience: "managers" }, { ...member, canManageMembers: true })).toBe(true);
    expect(matchPreparedAnswer(question("download offline charts"), member, [{ ...article, route: null }])).toMatchObject({ kind: "answer", sources: [] });
    expect(matchPreparedAnswer(question("download offline charts"), member, [{ ...article, route: "/songs/new" }])).toMatchObject({ kind: "answer", sources: [] });
  });
});
describe("record question parsing and boundaries", () => {
  it.each([
    ["What is the next event?", { intent: "next-event", date: "2026-12-31" }],
    ["Events tomorrow", { intent: "events-date", date: "2027-01-01" }],
    ["Events today", { intent: "events-date", date: "2026-12-31" }],
    ["Events on 2026-10-18", { intent: "events-date", date: "2026-10-18" }],
    ["Find setlist Sunday Service", { intent: "find-setlist", term: "Sunday Service" }],
    ["Songs in setlist Sunday Service", { intent: "setlist-songs", term: "Sunday Service" }],
    ["Find song Amazing Grace", { intent: "find-song", term: "Amazing Grace" }],
    ["Find song Song of Hope", { intent: "find-song", term: "Song of Hope" }],
    ["Key and BPM for Amazing Grace", { intent: "song-details", term: "Amazing Grace" }],
    ['Key for “Opening Song”', { intent: "song-details", term: "Opening Song" }],
    ['BPM of "Opening Song"', { intent: "song-details", term: "Opening Song" }],
  ])("parses %s", (text, expected) => expect(matchRecordQuestion(question(text))).toMatchObject(expected));
  it("asks for an exact date instead of guessing a format", () => {
    expect(needsWoolyDate(question("Events on 10/11/2026"))).toBe(true);
    expect(needsWoolyDate(question("Events on 2026-02-30"))).toBe(true);
    expect(needsWoolyDate(question("Events tomorrow"))).toBe(false);
  });
  it("keeps edit help out of record lookup and rejects forged choice kinds", () => {
    expect(matchRecordQuestion(question("How do I change a song key?"))).toBeNull();
    expect(woolyQuestionSchema.safeParse({ ...question("next event"), choice: { kind: "record", id: article.id, intent: "next-event" } }).success).toBe(false);
    expect(woolyQuestionSchema.safeParse({ ...question("song"), choice: { kind: "record", id: "other-team", intent: "find-song" } }).success).toBe(false);
  });
  it("rejects empty/oversize questions and removes external/query paths", () => {
    expect(supportRequestSchema.safeParse({ id: article.id, question: " ", details: "", pagePath: "/" }).success).toBe(false);
    expect(woolyQuestionSchema.safeParse(question("a".repeat(1001))).success).toBe(false);
    for (const path of ["https://evil.example", "//evil", "/songs?token=private", "/../foo"]) expect(safeWoolyPagePath(path)).toBe("/");
    expect(safeWoolyPagePath("/songs/safe-id")).toBe("/songs/safe-id");
  });
  it("counts unread replies and uses local calendar dates", () => {
    const row = { support_updated_at: "2026-10-11T04:00:00Z", requester_read_at: "2026-10-10T04:00:00Z" } as SupportRequest;
    expect(unreadSupportRequests([row, { ...row, support_updated_at: null }, { ...row, requester_read_at: row.support_updated_at! }])).toBe(1);
    expect(browserCalendarDate(new Date(2026, 9, 11, 1))).toBe("2026-10-11");
  });
});
