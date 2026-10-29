// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ selected: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/server/mobile/v2/context", async original => ({ ...await original<typeof import("@/lib/server/mobile/v2/context")>(), requireSelectedWorkspace: mocks.selected }));
vi.mock("@/lib/server/mobile/v2/workflow-commands", () => ({ applyMobileWorkflowCommands: mocks.apply }));
import { MobileApiError } from "@/lib/server/mobile/context";
import { OPTIONS, POST } from "./route";
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const identity = { userId: id(1), teamId: id(2), memberId: id(3), teamName: "Team", role: "member", permissions: [] };
const body = { version: 2, commands: [{ commandId: id(4), type: "attendance.respond", eventId: id(5), baseRevision: 0, baseEventRevision: 1, baseValue: null, status: "available", dependsOn: [] }] };
const context = { params: Promise.resolve({ teamId: id(2) }) };
function request(value: unknown = body, origin = "capacitor://localhost") { return new Request(`https://website.test/api/mobile/v2/workspaces/${id(2)}/commands`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) }); }
beforeEach(() => { vi.clearAllMocks(); mocks.selected.mockResolvedValue({ client: "verified bearer client", identity }); mocks.apply.mockResolvedValue({ version: 2, results: [] }); });
describe("selected workspace v2 workflow route", () => {
  it("checks account/workspace then sends validated intent through the shared bearer service", async () => {
    const incoming = request(); const response = await POST(incoming, context);
    expect(response.status).toBe(200);
    expect(mocks.selected).toHaveBeenCalledWith(incoming, id(2));
    expect(mocks.apply).toHaveBeenCalledWith({ client: "verified bearer client", identity, request: body });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect((await OPTIONS(request())).status).toBe(204);
  });
  it.each([401, 403, 409])("preserves selected identity denial %s without executing commands", async status => {
    mocks.selected.mockRejectedValue(new MobileApiError(status, "scope_changed", "Reopen the matching workspace."));
    expect((await POST(request(), context)).status).toBe(status); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("rejects unsupported origins, oversized bodies and forged fields before command execution", async () => {
    expect((await POST(request(body, "https://attacker.test"), context)).status).toBe(403); expect(mocks.selected).not.toHaveBeenCalled();
    expect((await POST(request({ ...body, padding: "x".repeat(65537) }), context)).status).toBe(413);
    expect((await POST(request({ ...body, actorId: id(99) }), context)).status).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
