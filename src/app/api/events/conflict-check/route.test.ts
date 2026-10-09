import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), getContext: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: mocks.getContext }));
const teamId = "11111111-1111-4111-8111-111111111111", memberId = "22222222-2222-4222-8222-222222222222", eventId = "33333333-3333-4333-8333-333333333333";
const event = { id: eventId, name: "Other service", event_date: "2026-10-11", starts_at: "09:00", ends_at: "11:00", rehearsal_date: "2026-10-10", rehearsal_time: "18:00", rehearsal_end_time: "19:00", event_assignments: [{ team_member_id: memberId }] };
const request = (extra: Record<string, unknown> = {}) => new Request("http://localhost/api/events/conflict-check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ date: "2026-10-11", startTime: "10:00", endTime: "12:00", memberIds: [memberId], ...extra }) });
function client(eventsError = false, membersError = false, events = [event]) {
  const filters: Array<[string, string, unknown]> = [];
  const from = vi.fn((table: string) => {
    const result = table === "events" ? { data: eventsError ? null : events, error: eventsError ? { message: "database unavailable" } : null } : { data: membersError ? null : [{ id: memberId, profile: { full_name: "Alex" } }], error: membersError ? { message: "profiles unavailable" } : null };
    const query = { select: vi.fn((columns: string) => { filters.push([table, "select", columns]); return query; }), eq: vi.fn((key: string, value: unknown) => { filters.push([table, key, value]); return query; }), is: vi.fn(() => query), in: vi.fn(() => query), or: vi.fn((value: string) => { filters.push([table,"or",value]); return query; }), neq: vi.fn(() => query), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    return query;
  });
  mocks.createClient.mockResolvedValue({ from }); return { filters, from };
}
beforeEach(() => { vi.clearAllMocks(); mocks.getContext.mockResolvedValue({ teamId }); vi.spyOn(console,"error").mockImplementation(() => {}); });
describe("event conflict boundary", () => {
  it("joins assignment member IDs and scopes active names and approved events to the team", async () => {
    const { filters } = client(); const response = await POST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ conflicts: [{ memberName:"Alex", eventName:"Other service" }] });
    expect(filters).toContainEqual(["events","team_id",teamId]); expect(filters).toContainEqual(["events","approval_status","approved"]);
    expect(filters).toContainEqual(["team_members","team_id",teamId]); expect(filters).toContainEqual(["team_members","status","active"]);
    expect(filters.find(([table,key])=>table==="events"&&key==="select")?.[2]).toContain("team_member_id");
  });
  it("does not report separated windows but includes rehearsals on a different date", async () => {
    client(); const separated = await POST(request({ startTime:"12:00",endTime:"13:00" })); expect(await separated.json()).toEqual({conflicts:[]});
    const { filters } = client(); const rehearsal = await POST(request({ date:"2026-10-12",startTime:"09:00",endTime:"11:00",rehearsalDate:"2026-10-10",rehearsalStartTime:"18:30",rehearsalEndTime:"20:00" }));
    expect((await rehearsal.json()).conflicts).toHaveLength(1); expect(filters.find(([,key])=>key==="or")?.[2]).toContain("2026-10-10");
  });
  it.each([[true,false],[false,true]])("returns unavailable rather than clean conflicts when a query fails (%s/%s)", async (eventsError,membersError) => {
    client(eventsError,membersError); const response = await POST(request()); expect(response.status).toBe(503); expect(await response.json()).toEqual({error:expect.stringContaining("could not be checked")});
  });
  it("rejects malformed dates and forged field names before accessing data", async () => {
    const { from } = client(); expect((await POST(request({date:"2026-99-11"}))).status).toBe(400); expect((await POST(request({teamId:"foreign"}))).status).toBe(400); expect(from).not.toHaveBeenCalled();
  });
});
