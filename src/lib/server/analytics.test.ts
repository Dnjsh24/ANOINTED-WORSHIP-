import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyticsDayTimestamp, parseAnalyticsRange } from "@/lib/domain/analytics";
import { createDemoAnalytics, loadAnalytics } from "@/lib/server/analytics";

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
    expect(pages).toHaveLength(3);
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

  it("uses the delivered publication proxy and tolerates nullable/array joins", async () => {
    answer = (query) => query.table === "messages" ? ready([
      { id: "a", channel_id: "c", created_at: "2026-01-01T00:00:00Z", scheduled_for: "2026-10-01T00:00:00Z", message_channels: [{ name: "Team", team_id: "team-one" }] },
      { id: "b", channel_id: "c", created_at: "2026-10-02T00:00:00Z", scheduled_for: null, message_channels: { name: "Team", team_id: "team-one" } },
      { id: "c", channel_id: "c", created_at: "2026-10-03T00:00:00Z", scheduled_for: null, message_channels: null },
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
    answer = (query) => query.table === "activity_logs" ? ready([
      { id: "one", action: "created", target_type: "song", details: { title: "Opening Song" }, created_at: "2026-10-01T01:00:00Z", profile: [{ full_name: "Alex" }] },
      { id: "two", action: "created", target_type: "setlist", details: ["hidden"], created_at: "2026-10-01T01:00:00Z", profile: null },
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
});

describe("Explicit Analytics demo", () => {
  it("uses original demo song titles and coherent current/previous dates without live queries", () => {
    const demo = createDemoAnalytics(range);
    expect(demo.mode).toBe("demo");
    expect(client.createClient).not.toHaveBeenCalled();
    expect(demo.range).toEqual(range);
    if (demo.songs.status === "ready") expect(demo.songs.data[0]).toMatchObject({ title: "Opening Song", count: 4, previousCount: 4 });
    if (demo.availability.status === "ready") {
      expect(demo.availability.data.current.rate).toBe(70);
      expect(demo.availability.data.previous.rate).toBe(60);
    }
    if (demo.activity.status === "ready") expect(demo.activity.data.every((item) => item.createdAt >= analyticsDayTimestamp(range.start))).toBe(true);
    expect(createDemoAnalytics(parseAnalyticsRange({}, now)).totals).toEqual(demo.totals);
  });
});
