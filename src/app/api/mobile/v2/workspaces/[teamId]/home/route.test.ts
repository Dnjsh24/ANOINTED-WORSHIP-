// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ selected: vi.fn(), home: vi.fn() }));
vi.mock("@/lib/server/mobile/v2/context", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/server/mobile/v2/context")>(), requireSelectedWorkspace: mocks.selected }));
vi.mock("@/lib/dashboard/home", () => ({ readHomeContent: mocks.home }));
import { MobileApiError } from "@/lib/server/mobile/context";
import { GET } from "./route";
const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const identity = { userId: id(1), teamId: id(2), memberId: id(3), teamName: "Team", role: "member", permissions: ["members.manage"] };
const model = { teamName: "Team", firstName: "Daniel", nextEvent: null, nextSetlist: null, nextSetlistTypeLabel: "", nextDateLabel: "No Service Scheduled", setlistSongs: [], isAdminOrOwner: false,
  upcomingEventsCount: 0, pendingRequestsCount: null, confirmedThisMonthCount: null, myConfirmedCount: 0, totalSetlistsCount: 0, announcementItems: [], reminders: [], activityLogs: [], upcomingCelebrations: [], quickLinks: [] };
function request(origin = "capacitor://localhost") { return new Request(`https://website.example/api/mobile/v2/workspaces/${id(2)}/home`, { headers: { origin } }); }
const routeContext = { params: Promise.resolve({ teamId: id(2) }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.selected.mockResolvedValue({ client: "verified RLS client", identity });
  mocks.home.mockResolvedValue(model);
});
describe("v2 Home selected workspace boundary", () => {
  it("rechecks explicit selected scope and calls the shared Home service", async () => {
    const incoming = request();
    const response = await GET(incoming, routeContext);
    expect(response.status).toBe(200);
    expect(mocks.selected).toHaveBeenCalledWith(incoming, id(2));
    expect(mocks.home).toHaveBeenCalledWith("verified RLS client", { ...identity, canManageMembers: true }, { now: expect.any(Date) });
    expect(await response.json()).toMatchObject({ version: 2, identity, model, asOf: expect.any(String) });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each([401, 403, 409])("propagates %s selected-workspace failures without Home reads", async status => {
    mocks.selected.mockRejectedValue(new MobileApiError(status, "membership", "Reopen the matching workspace."));
    const response = await GET(request(), routeContext);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ version: 2, error: { code: "membership" } });
    expect(mocks.home).not.toHaveBeenCalled();
  });
  it("rejects unsupported origins before verification", async () => {
    expect((await GET(request("https://attacker.example"), routeContext)).status).toBe(403);
    expect(mocks.selected).not.toHaveBeenCalled();
  });
  it("returns safe unavailable errors so native callers retain prior cache", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.home.mockRejectedValue(new Error("private SQL"));
    const response = await GET(request(), routeContext);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ version: 2, error: { code: "unavailable" } });
    log.mockRestore();
  });
});
