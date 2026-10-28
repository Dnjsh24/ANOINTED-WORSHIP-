import { describe, expect, it, vi } from "vitest";
import { readWoolyRecords } from "./wooly-records-source";

function database(results: { data: object[] | null; error: object | null }[]) {
  const queries: { table: string; filters: [string, unknown[]][] }[] = [];
  const from = vi.fn((table: string) => {
    const filters: [string, unknown[]][] = [];
    queries.push({ table, filters });
    const result = results.shift() ?? { data: [], error: null };
    const query = { then: (resolve: (data: unknown) => unknown) => Promise.resolve(result).then(resolve) } as Record<string, unknown>;
    for (const method of ["select", "eq", "is", "ilike", "order", "gte", "limit", "in"]) query[method] = (...args: unknown[]) => { filters.push([method, args]); return query; };
    return query;
  });
  return { client: { from } as unknown as Parameters<typeof readWoolyRecords>[0], queries };
}
const ok = (data: object[]) => ({ data, error: null });
const song = { id: "s1", title: "Grace", original_key: "D", bpm: 72 };
const list = { id: "l1", name: "Sunday", setlist_date: "2026-10-18" };

describe("permitted fresh record summaries", () => {
  it("scopes a forged song ID to the verified team and hides deleted songs", async () => {
    const db = database([ok([])]);
    expect(await readWoolyRecords(db.client, "team-a", { intent: "song-details", id: "team-b-song", term: "" })).toMatchObject({ kind: "answer", text: expect.stringContaining("couldn’t find") });
    expect(db.queries[0].filters).toContainEqual(["eq", ["team_id", "team-a"]]);
    expect(db.queries[0].filters).toContainEqual(["eq", ["id", "team-b-song"]]);
    expect(db.queries[0].filters).toContainEqual(["is", ["deleted_at", null]]);
  });
  it("returns stored key/BPM and a real song link", async () => {
    const db = database([ok([song])]);
    expect(await readWoolyRecords(db.client, "a", { intent: "song-details", term: "Grace" })).toMatchObject({ kind: "answer", text: expect.stringContaining("D; BPM 72"), sources: [{ href: "/songs/s1", label: "Grace" }] });
  });
  it("does not invent absent key/BPM", async () => {
    const db = database([ok([{ ...song, original_key: null, bpm: null }])]);
    expect(await readWoolyRecords(db.client, "a", { intent: "find-song", term: "Grace" })).toMatchObject({ text: expect.stringContaining("not set") });
  });
  it("asks users to choose similar songs and escapes wildcard search", async () => {
    const db = database([ok([song, { ...song, id: "s2", title: "Grace Live" }])]);
    const result = await readWoolyRecords(db.client, "a", { intent: "find-song", term: "%_" });
    expect(result).toMatchObject({ kind: "clarification", choices: [{ value: { id: "s1", intent: "find-song" } }, { value: { id: "s2" } }] });
    expect(db.queries[0].filters).toContainEqual(["ilike", ["title", "%\\%\\_%"]]);
  });
  it("requires a record name", async () => {
    const db = database([]);
    expect(await readWoolyRecords(db.client, "a", { intent: "find-setlist", term: "" })).toMatchObject({ kind: "clarification", choices: [] });
    expect(db.queries).toHaveLength(0);
  });
  it.each(["next-event", "events-date"] as const)("shows exact dates for %s and only approved events", async (intent) => {
    const db = database([ok([{ id: "e1", name: "Service", event_date: "2026-10-18", starts_at: "09:00:00", location: "Hall" }])]);
    expect(await readWoolyRecords(db.client, "a", { intent, term: "", date: "2026-10-18" })).toMatchObject({ text: "Service: 2026-10-18, 09:00 at Hall.", sources: [{ href: "/events/e1" }] });
    expect(db.queries[0].filters).toContainEqual(["eq", ["approval_status", "approved"]]);
    expect(db.queries[0].filters).toContainEqual([intent === "next-event" ? "gte" : "eq", ["event_date", "2026-10-18"]]);
  });
  it("handles empty events and no location", async () => {
    const db = database([ok([]), ok([{ id: "e", name: "Rehearsal", event_date: "2026-10-18", starts_at: "10:00", location: null }])]);
    expect(await readWoolyRecords(db.client, "a", { intent: "events-date", term: "", date: "2026-10-18" })).toMatchObject({ text: expect.stringContaining("no approved events on 2026-10-18") });
    expect(await readWoolyRecords(db.client, "a", { intent: "next-event", term: "", date: "2026-10-18" })).toMatchObject({ text: "Rehearsal: 2026-10-18, 10:00." });
  });
  it("finds setlists with a dated source and asks about ambiguous names", async () => {
    const db = database([ok([list]), ok([list, { ...list, id: "l2" }]), ok([])]);
    expect(await readWoolyRecords(db.client, "a", { intent: "find-setlist", term: "Sunday" })).toMatchObject({ text: "Sunday is dated 2026-10-18.", sources: [{ href: "/setlists/l1" }] });
    expect(await readWoolyRecords(db.client, "a", { intent: "setlist-songs", term: "Sunday" })).toMatchObject({ kind: "clarification" });
    expect(await readWoolyRecords(db.client, "a", { intent: "find-setlist", id: "deleted", term: "" })).toMatchObject({ text: expect.stringContaining("couldn’t find") });
  });
  it("lists assigned keys only for accessible songs in the selected setlist", async () => {
    const db = database([ok([list]), ok([{ song_id: "s1", assigned_key: "E", song_order: 1 }, { song_id: "deleted", assigned_key: "C", song_order: 2 }]), ok([song])]);
    expect(await readWoolyRecords(db.client, "a", { intent: "setlist-songs", id: "l1", term: "" })).toMatchObject({ text: "Sunday (2026-10-18):\n1. Grace — key E" });
    expect(db.queries[1].filters).toContainEqual(["eq", ["setlist_id", "l1"]]);
    expect(db.queries[2].filters).toContainEqual(["eq", ["team_id", "a"]]);
  });
  it("handles empty plans and missing nested songs", async () => {
    for (const results of [[ok([list]), ok([])], [ok([list]), ok([{ song_id: "gone", assigned_key: null }]), ok([])]]) {
      const db = database(results);
      expect(await readWoolyRecords(db.client, "a", { intent: "setlist-songs", term: "Sunday" })).toMatchObject({ kind: "answer", text: expect.stringMatching(/no songs|No accessible songs/) });
    }
  });
  it.each(["next-event", "find-song", "find-setlist"] as const)("distinguishes unavailable %s data from empty records", async (intent) => {
    const db = database([{ data: null, error: { message: "denied" } }]);
    expect((await readWoolyRecords(db.client, "a", { intent, term: "test", date: "2026-10-18" })).kind).toBe("unavailable");
  });
  it("propagates nested lookup failure", async () => {
    for (const results of [[ok([list]), { data: null, error: {} }], [ok([list]), ok([{ song_id: "s1" }]), { data: null, error: {} }]]) {
      expect((await readWoolyRecords(database(results).client, "a", { intent: "setlist-songs", term: "Sunday" })).kind).toBe("unavailable");
    }
  });
});
