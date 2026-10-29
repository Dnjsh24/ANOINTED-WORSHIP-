import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsDayTimestamp, parseAnalyticsRange } from "@/lib/domain/analytics";
import { loadAnalytics } from "@/lib/server/mobile/analytics-source";

const client = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => client);

type Operation = { method: string; args: unknown[] };
type Query = { table: string; operations: Operation[] };
type Result = { data: Record<string, unknown>[] | null; error: { code: string } | null; count: number | null };
let queries: Query[];
let answer: (query: Query) => Result;
const now = new Date("2026-10-08T02:00:00Z");
const range = parseAnalyticsRange({ start: "2026-10-01", end: "2026-10-07" }, now);

function queryBuilder(table: string) {
  const operations: Operation[] = [];
  const operation = (method: string, ...args: unknown[]) => { operations.push({ method, args }); return builder; };
  const builder = {
    select: (...args: unknown[]) => operation("select", ...args),
    eq: (...args: unknown[]) => operation("eq", ...args),
    is: (...args: unknown[]) => operation("is", ...args),
    gte: (...args: unknown[]) => operation("gte", ...args),
    lte: (...args: unknown[]) => operation("lte", ...args),
    lt: (...args: unknown[]) => operation("lt", ...args),
    gt: (...args: unknown[]) => operation("gt", ...args),
    or: (...args: unknown[]) => operation("or", ...args),
    order: (...args: unknown[]) => operation("order", ...args),
    limit: (...args: unknown[]) => operation("limit", ...args),
    abortSignal: (...args: unknown[]) => operation("abortSignal", ...args),
    then: (resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) => {
      const query = { table, operations };
      queries.push(query);
      return Promise.resolve().then(() => answer(query)).then(resolve, reject);
    },
  };
  return builder;
}

function isCount(query: Query) {
  return query.operations.some((op) => op.method === "select" && typeof op.args[1] === "object");
}

function has(query: Query, method: string, ...args: unknown[]) {
  return query.operations.some((op) => op.method === method && JSON.stringify(op.args) === JSON.stringify(args));
}

function ready(data: Record<string, unknown>[] = [], count: number | null = 0): Result {
  return { data, error: null, count };
}

beforeEach(() => {
  vi.restoreAllMocks();
  client.createClient.mockClear();
  queries = [];
  answer = () => ready();
  client.createClient.mockResolvedValue({ from: queryBuilder });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("Analytics server reads", () => {
  it("uses authenticated team-scoped read filters and exact current inventory counts", async () => {
    const data = await loadAnalytics("team-one", range, now);
    expect(data.mode).toBe("live");
    expect(data.songs).toEqual({ status: "ready", data: [] });
    expect(data.totals).toHaveLength(8);
    expect(data.totals.every((total) => total.value === 0 && total.message === null)).toBe(true);
    for (const query of queries) {
      const scope = query.table === "setlist_songs" ? "setlists.team_id" : query.table === "attendance" ? "events.team_id" : query.table === "messages" ? "message_channels.team_id" : "team_id";
      expect(has(query, "eq", scope, "team-one")).toBe(true);
    }
    const placements = queries.find((query) => query.table === "setlist_songs");
    expect(placements?.operations).toEqual(expect.arrayContaining([
      { method: "is", args: ["deleted_at", null] },
      { method: "is", args: ["setlists.deleted_at", null] },
      { method: "is", args: ["songs.deleted_at", null] },
      { method: "gte", args: ["setlists.setlist_date", range.previousStart] },
      { method: "lte", args: ["setlists.setlist_date", range.end] },
    ]));
    for (const query of queries.filter((query) => ["events", "attendance"].includes(query.table) && !isCount(query))) {
      const prefix = query.table === "attendance" ? "events." : "";
      expect(has(query, "eq", `${prefix}approval_status`, "approved")).toBe(true);
      expect(has(query, "is", `${prefix}deleted_at`, null)).toBe(true);
      expect(has(query, "lt", `${prefix}event_date`, range.today)).toBe(true);
    }
    expect(queries.filter(isCount).every((query) => has(query, "select", "id", { count: "exact", head: true }))).toBe(true);
    expect(queries.filter(isCount).find((query) => query.table === "team_members")?.operations).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(queries.filter(isCount).find((query) => query.table === "join_requests")?.operations).toContainEqual({ method: "eq", args: ["status", "pending"] });
  });

  it("reads beyond 1,000 rows using stable cursors and sums all channels", async () => {
    answer = (query) => {
      if (query.table !== "messages") return ready();
      const cursor = query.operations.find((op) => op.method === "gt")?.args[1];
      const start = typeof cursor === "string" ? Number(cursor) + 1 : 0;
      return ready(Array.from({ length: Math.min(500, 1201 - start) }, (_, offset) => ({
        id: String(start + offset).padStart(5, "0"), channel_id: `channel-${(start + offset) % 7}`,
        created_at: "2026-10-01T01:00:00Z", scheduled_for: null,
        message_channels: { name: `Channel ${(start + offset) % 7}`, team_id: "team-one" },
      })));
    };
    const data = await loadAnalytics("team-one", range, now);
    expect(data.messages.status).toBe("ready");
    if (data.messages.status === "ready") {
      expect(data.messages.data).toHaveLength(7);
      expect(data.messages.data.reduce((sum, channel) => sum + channel.count, 0)).toBe(1201);
    }
    const pages = queries.filter((query) => query.table === "messages");
    expect(pages).toHaveLength(4);
    expect(has(pages[1], "gt", "id", "00499")).toBe(true);
    expect(pages.every((page) => has(page, "order", "id", { ascending: true }) && has(page, "limit", 500))).toBe(true);
  });

  it("discards a partial aggregate after a later-page error without replacing live data with demo data", async () => {
    answer = (query) => {
      if (query.table !== "setlist_songs") return ready();
      if (query.operations.some((op) => op.method === "gt")) return { data: null, error: { code: "42501" }, count: null };
      return ready(Array.from({ length: 500 }, (_, index) => ({
        id: String(index).padStart(5, "0"), song_id: "opening-song", songs: { title: "Opening Song" },
        setlists: { team_id: "team-one", setlist_date: "2026-10-01", deleted_at: null },
      })));
    };
    const data = await loadAnalytics("team-one", range, now);
    expect(data.songs).toEqual({ status: "unavailable", message: "Song usage could not be loaded. Try again." });
    expect(data.messages).toEqual({ status: "ready", data: [] });
    expect(data.mode).toBe("live");
  });

  it("uses the delivered publication proxy with singular object/array joins", async () => {
    answer = (query) => query.table === "messages" && !query.operations.some(op => op.method === 'gt') ? ready([
      { id: "a", channel_id: "c", created_at: "2026-01-01T00:00:00Z", scheduled_for: "2026-10-01T00:00:00Z", message_channels: [{ name: "Team", team_id: "team-one" }] },
      { id: "b", channel_id: "c", created_at: "2026-10-02T00:00:00Z", scheduled_for: null, message_channels: { name: "Team", team_id: "team-one" } },
    ]) : ready();
    const data = await loadAnalytics("team-one", range, now);
    expect(data.messages).toEqual({ status: "ready", data: [{ id: "c", name: "Team", count: 2, previousCount: 0 }] });
    const query = queries.find((query) => query.table === "messages");
    expect(query?.operations).toContainEqual({ method: "eq", args: ["is_delivered", true] });
    expect(query?.operations).toContainEqual({ method: "or", args: ["and(scheduled_for.gte.2026-09-23T16:00:00.000Z,scheduled_for.lt.2026-10-07T16:00:00.000Z),and(scheduled_for.is.null,created_at.gte.2026-09-23T16:00:00.000Z,created_at.lt.2026-10-07T16:00:00.000Z)"] });
  });

  it("keeps failed/null counts unavailable and distinguishes zero responses from zero availability", async () => {
    answer = (query) => {
      if (isCount(query)) {
        if (query.table === "songs") throw new Error("network failure with private details");
        return ready([], query.table === "team_members" ? null : 4);
      }
      if (query.operations.some(op => op.method === 'gt')) return ready();
      if (query.table === "events") return ready([{ id: "event", type: "service", event_date: "2026-10-01" }]);
      if (query.table === "attendance") return ready([{ id: "response", event_id: "event", status: "pending", events: { team_id: "team-one" } }]);
      return ready();
    };
    const data = await loadAnalytics("team-one", range, now);
    expect(data.totals.find((total) => total.id === "songs")?.value).toBeNull();
    expect(data.totals.find((total) => total.id === "members")?.message).toBeTruthy();
    expect(data.totals.find((total) => total.id === "channels")?.value).toBe(4);
    if (data.availability.status === "ready") {
      expect(data.availability.data.current.rate).toBe(0);
      expect(data.availability.data.previous.rate).toBeNull();
    }
    expect(JSON.stringify(data)).not.toContain("private details");
  });

  it("bounds actual activity rows and normalizes titles and missing profile joins", async () => {
    answer = (query) => query.table === "activity_logs" && !query.operations.some(op => op.method === 'or') ? ready([
      { id: "two", action: "created", target_type: "song", details: { title: "Opening Song" }, created_at: "2026-10-01T01:00:00Z", profile: [{ full_name: "Alex" }] },
      { id: "one", action: "created", target_type: "setlist", details: ["hidden"], created_at: "2026-10-01T01:00:00Z", profile: null },
    ]) : ready();
    const data = await loadAnalytics("team-one", range, now);
    expect(data.activity.status).toBe("ready");
    if (data.activity.status === "ready") expect(data.activity.data[0]).toMatchObject({ actor: "Alex", description: "Created song: Opening Song" });
    const query = queries.find((query) => query.table === "activity_logs");
    expect(query?.operations).toContainEqual({ method: "limit", args: [50] });
    expect(query?.operations).toContainEqual({ method: "gte", args: ["created_at", analyticsDayTimestamp(range.start)] });
    expect(query?.operations).toContainEqual({ method: "order", args: ["id", { ascending: false }] });
  });

  it("caps today's message/activity timestamp bound at now and propagates source errors", async () => {
    answer = (query) => ["attendance", "activity_logs"].includes(query.table)
      ? { data: null, error: { code: "42501" }, count: null } : ready();
    const data = await loadAnalytics("team-two", parseAnalyticsRange({}, now), now);
    expect(data.availability.status).toBe("unavailable");
    expect(data.activity.status).toBe("unavailable");
    expect(queries.find((query) => query.table === "activity_logs")?.operations).toContainEqual({ method: "lt", args: ["created_at", now.toISOString()] });
    expect(queries.find((query) => query.table === "messages")?.operations.find((op) => op.method === "or")?.args[0]).toContain(now.toISOString());
  });

  it("continues short capped pages until empty and fails missing/ambiguous/foreign joins without partial counts", async () => {
    answer = (query) => {
      if (query.table !== 'messages') return ready();
      const cursor = query.operations.find(op => op.method === 'gt')?.args[1];
      return cursor === 'b' ? ready() : ready([{ id: cursor ? 'b' : 'a', channel_id: 'c', created_at: '2026-10-01T00:00:00Z', scheduled_for: null, message_channels: { name: 'Team', team_id: 'team-one' } }]);
    };
    expect((await loadAnalytics('team-one', range, now)).messages).toEqual({ status: 'ready', data: [{ id: 'c', name: 'Team', count: 2, previousCount: 0 }] });
    for (const join of [null, [], [{ name: 'A', team_id: 'team-one' }, { name: 'B', team_id: 'team-one' }], { name: 'Foreign', team_id: 'other-team' }]) {
      answer = (query) => query.table === 'messages' && !query.operations.some(op => op.method === 'gt') ? ready([{ id: 'a', channel_id: 'c', created_at: '2026-10-01T00:00:00Z', scheduled_for: null, message_channels: join }]) : ready();
      expect((await loadAnalytics('team-one', range, now)).messages.status).toBe('unavailable');
    }
  });

  it("rejects duplicate/regressed rows and over-limit sources rather than returning a partial ready aggregate", async () => {
    answer = (query) => query.table === 'messages' ? ready([{ id: 'a' }, { id: 'a' }]) : ready();
    expect((await loadAnalytics('team-one', range, now)).messages.status).toBe('unavailable');
    answer = (query) => {
      if (query.table !== 'messages') return ready();
      const cursor = query.operations.find(op => op.method === 'gt')?.args[1];
      const start = typeof cursor === 'string' ? Number(cursor) + 1 : 0;
      return ready(Array.from({ length: 500 }, (_, offset) => ({ id: String(start + offset).padStart(6, '0') })));
    };
    expect((await loadAnalytics('team-one', range, now)).messages.status).toBe('unavailable');
    expect(queries.filter(query => query.table === 'messages')).toHaveLength(102);
  });

  it('fills the newest50 activity window across capped pages with a stable timestamp/ID cursor', async () => {
    answer = query => {
      if (query.table !== 'activity_logs') return ready();
      const filter = query.operations.find(op => op.method === 'or')?.args[0];
      const before = typeof filter === 'string' ? Number(filter.match(/id\.lt\.(\d+)/)?.[1]) : 55;
      const remaining = Number(query.operations.find(op => op.method === 'limit')?.args[0]);
      return ready(Array.from({ length: Math.min(7, before, remaining) }, (_, offset) => ({ id: String(before - offset - 1).padStart(5, '0'), action: 'created', target_type: 'song',
        details: null, created_at: '2026-10-01T01:00:00Z', profile: null })));
    };
    const data = await loadAnalytics('team-one', range, now);
    expect(data.activity.status).toBe('ready');
    if (data.activity.status === 'ready') { expect(data.activity.data).toHaveLength(50); expect(data.activity.data[0].id).toBe('00054'); expect(data.activity.data.at(-1)?.id).toBe('00005'); }
    expect(queries.filter(query => query.table === 'activity_logs')).toHaveLength(8);
  });

  it("uses the injected authenticated client, propagates abort to all queries and never converts cancellation into unavailable success", async () => {
    const injected = await client.createClient(); client.createClient.mockClear();
    const controller = new AbortController();
    await loadAnalytics('team-one', range, now, { client: injected, signal: controller.signal });
    expect(client.createClient).not.toHaveBeenCalled(); expect(queries.every(query => has(query, 'abortSignal', controller.signal))).toBe(true);
    controller.abort(); const before = queries.length;
    await expect(loadAnalytics('team-one', range, now, { client: injected, signal: controller.signal })).rejects.toThrow(); expect(queries).toHaveLength(before);
    const during = new AbortController(); answer = () => { during.abort(); return ready(); };
    await expect(loadAnalytics('team-one', range, now, { client: injected, signal: during.signal })).rejects.toThrow();
  });
});

