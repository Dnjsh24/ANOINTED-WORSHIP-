// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { mobileHomeContentSchema, mobileHomeResponseSchema } from "@/lib/mobile/v2/home";
import { getHomeQuickLinks, HomeReadError, readHomeContent } from "./home";

const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const context = { userId: id(1), teamId: id(2), memberId: id(3), teamName: "Worship Team", role: "member", canManageMembers: false };
const now = new Date("2026-10-16T04:00:00Z");
const options = { now };
type CapturedRequest = { url: URL; method: string };
function database(overrides: (request: CapturedRequest) => { data?: unknown; count?: number | null; fail?: boolean } = () => ({})) {
  const requests: CapturedRequest[] = [];
  const client = createClient<Database>("https://test.supabase.co", "publishable-test-key", {
    auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const request = { url: new URL(String(input)), method: init?.method ?? "GET" };
      requests.push(request);
      const result = overrides(request);
      if (result.fail) return Response.json({ code: "42501", message: "private SQL details" }, { status: 403 });
      if (request.method === "HEAD") return new Response(null, { headers: result.count === null ? {} : { "Content-Range": `*/${result.count ?? 0}` } });
      const table = request.url.pathname.split("/").at(-1);
      const defaults = table === "profiles" ? { full_name: "Daniel Cruz" } : ["events", "setlists"].includes(table ?? "") ? null : [];
      return Response.json(result.data === undefined ? defaults : result.data);
    } },
  });
  return { client, requests };
}
const tableIs = (request: CapturedRequest, table: string) => request.url.pathname.endsWith(`/${table}`);
describe("shared website and native Home reads", () => {
  it("returns genuine empty state and zero counts without sample services", async () => {
    const db = database();
    const model = await readHomeContent(db.client, context, options);
    expect(model).toMatchObject({ teamName: context.teamName, firstName: "Daniel", nextEvent: null, nextSetlist: null, setlistSongs: [],
      upcomingEventsCount: 0, myConfirmedCount: 0, totalSetlistsCount: 0, pendingRequestsCount: null, confirmedThisMonthCount: null,
      announcementItems: [], reminders: [], activityLogs: [], upcomingCelebrations: [], nextDateLabel: "No Service Scheduled" });
    expect(mobileHomeContentSchema.safeParse(model).success).toBe(true);
    expect(db.requests.some(request => tableIs(request, "join_requests"))).toBe(false);
  });
  it.each([context.teamId, id(22)])("scopes every team read to selected team %s and personal reads to profile/member", async teamId => {
    const db = database();
    await readHomeContent(db.client, { ...context, teamId }, options);
    for (const request of db.requests) {
      const query = request.url.searchParams;
      if (tableIs(request, "profiles")) expect(query.get("id")).toBe(`eq.${context.userId}`);
      else if (tableIs(request, "attendance")) {
        expect(query.get("events.team_id")).toBe(`eq.${teamId}`);
        expect(query.get("team_member_id")).toBe(`eq.${context.memberId}`);
      } else expect(query.get("team_id")).toBe(`eq.${teamId}`);
    }
    const reminder = db.requests.find(request => tableIs(request, "notifications"));
    expect(reminder?.url.searchParams.get("profile_id")).toBe(`eq.${context.userId}`);
    expect(reminder?.url.searchParams.get("scheduled_for")).toBe(`lte.${now.toISOString()}`);
    const event = db.requests.find(request => tableIs(request, "events") && request.method === "GET");
    expect(event?.url.searchParams.get("approval_status")).toBe("eq.approved");
    expect(event?.url.searchParams.get("deleted_at")).toBe("is.null");
    expect(event?.url.searchParams.get("event_assignments.team_member_id")).toBe(`eq.${context.memberId}`);
  });
  it.each(["admin", "owner"])("preserves %s monthly attendance and request counts", async role => {
    const db = database(request => ({ count: tableIs(request, "join_requests") ? 2 : 9 }));
    const model = await readHomeContent(db.client, { ...context, role, canManageMembers: true }, options);
    expect(model).toMatchObject({ isAdminOrOwner: true, pendingRequestsCount: 2, confirmedThisMonthCount: 9, myConfirmedCount: null, totalSetlistsCount: null });
    const attendance = db.requests.find(request => tableIs(request, "attendance"));
    expect(attendance?.url.searchParams.get("events.event_date")).toContain("2026-10-01");
    expect(attendance?.url.searchParams.getAll("events.event_date")).toHaveLength(2);
    expect(attendance?.url.searchParams.has("team_member_id")).toBe(false);
    expect(model.quickLinks.map(link => link.href)).toContain("/analytics");
    expect(model.quickLinks.map(link => link.href)).toContain("/members");
  });
  it("maps live services, announcements, reminders and activity with website visuals", async () => {
    const db = database(request => {
      if (tableIs(request, "events") && request.method === "GET") return { data: { id: id(4), name: "Friday Worship" } };
      if (tableIs(request, "setlists") && request.method === "GET") return { data: {
        id: id(5), name: "Sunday Worship", setlist_date: "2026-10-18", location: "Chapel", call_time: "08:30:00", rehearsal_time: "07:30:00", service_times: ["Youth Service"],
        events: { type: "service" }, leader: { profiles: { full_name: "Ruth" } },
        setlist_songs: [{ id: id(6), assigned_key: "D", song_order: 1, song: { id: id(7), title: "Grace", bpm: 90 } }],
      } };
      if (tableIs(request, "announcements")) return { data: [{ category: "urgent", title: "Room moved", body: "Use Chapel." }] };
      if (tableIs(request, "notifications")) return { data: [{ title: "Attendance reminder", body: null, read_at: null, acknowledged_at: null, target_path: "/reminders" }] };
      if (tableIs(request, "activity_logs")) return { data: [{ id: id(8), action: "created", target_type: "setlist", created_at: now.toISOString(), profile: [{ full_name: "Ruth" }], details: { name: "Sunday Worship" } }] };
      return {};
    });
    const model = await readHomeContent(db.client, context, options);
    expect(model.nextSetlist).toMatchObject({ name: "Sunday Worship", callTime: "08:30", leader: "Ruth" });
    expect(model.nextSetlistTypeLabel).toBe("Service - Youth Service");
    expect(model.setlistSongs[0].song.title).toBe("Grace");
    expect(model.announcementItems[0]).toMatchObject({ iconKey: "alertTriangle", badge: "Attention" });
    expect(model.reminders[0]).toMatchObject({ iconKey: "users", due: "Unread", body: "Open this reminder for details." });
    expect(model.activityLogs[0]).toMatchObject({ targetType: "setlist", profile: { fullName: "Ruth" }, details: { name: "Sunday Worship" } });
  });
  it("pages all celebration members rather than silently omitting larger teams", async () => {
    const members = Array.from({ length: 60 }, (_, index) => ({ id: id(index + 100), team_anniversary: null, profile: { full_name: `Member ${index}`, birthday: "2000-10-20" } }));
    const db = database(request => {
      if (!tableIs(request, "team_members")) return {};
      const after = request.url.searchParams.get("id")?.replace("gt.", "");
      return { data: members.filter(row => !after || row.id > after).slice(0, 51) };
    });
    const model = await readHomeContent(db.client, context, options);
    expect(model.upcomingCelebrations).toHaveLength(60);
    expect(model.upcomingCelebrations[0]).toMatchObject({ type: "Birthday", daysAway: 4 });
    expect(db.requests.filter(request => tableIs(request, "team_members"))).toHaveLength(2);
  });
  it.each(["profiles", "events", "setlists", "announcements", "notifications", "activity_logs", "attendance", "team_members", "join_requests"])("throws for failed %s reads instead of returning demo/zero data", async table => {
    const db = database(request => ({ fail: tableIs(request, table) }));
    await expect(readHomeContent(db.client, { ...context, role: "owner" }, options)).rejects.toBeInstanceOf(HomeReadError);
  });
  it("rejects missing counts, malformed records, unsafe navigation, and invalid context", async () => {
    const noCount = database(() => ({ count: null }));
    await expect(readHomeContent(noCount.client, context, options)).rejects.toBeInstanceOf(HomeReadError);
    const malformed = database(request => tableIs(request, "events") && request.method === "GET" ? { data: { id: "bad", name: "Invalid" } } : {});
    await expect(readHomeContent(malformed.client, context, options)).rejects.toBeInstanceOf(HomeReadError);
    const external = database(request => tableIs(request, "notifications") ? { data: [{ title: "Open", body: "", read_at: null, acknowledged_at: null, target_path: "https://attacker.example" }] } : {});
    await expect(readHomeContent(external.client, context, options)).rejects.toBeInstanceOf(HomeReadError);
    const invalid = database();
    await expect(readHomeContent(invalid.client, { ...context, teamId: "bad" }, options)).rejects.toBeInstanceOf(HomeReadError);
    expect(invalid.requests).toHaveLength(0);
  });
  it("uses explicit platform options and keeps mobile response identity bound to its model", async () => {
    expect(getHomeQuickLinks(context, true).map(link => link.href)).toContain("/presenter");
    expect(getHomeQuickLinks(context, true).map(link => link.href)).toContain("/sync");
    expect(getHomeQuickLinks(context).map(link => link.href)).toContain("/worship-remote");
    expect(getHomeQuickLinks(context).map(link => link.href)).not.toContain("/members");
    const model = await readHomeContent(database().client, context, options);
    const response = { version: 2, model, asOf: now.toISOString() };
    const identity = { userId: context.userId, teamId: context.teamId, memberId: context.memberId, teamName: context.teamName, role: context.role };
    expect(mobileHomeResponseSchema.safeParse({ ...response, identity: { ...identity, permissions: [] } }).success).toBe(true);
    expect(mobileHomeResponseSchema.safeParse({ ...response, identity: { ...identity, teamName: "Another Team", permissions: [] } }).success).toBe(false);
  });
});
