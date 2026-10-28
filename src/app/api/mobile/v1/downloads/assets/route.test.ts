// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), action: vi.fn() }));
vi.mock("@/lib/server/mobile/context", () => ({ requireMobileContext: mocks.context,
  MobileApiError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } },
}));
vi.mock("@/lib/server/mobile/assets", () => ({ readMobileAssets : mocks.action }));
import { MobileApiError } from "@/lib/server/mobile/context";
import { OPTIONS, POST } from "./route";
const manifestId = "10000000-0000-4000-8000-000000000001";
const body = { version: 1,  manifestId };
function request(value: unknown = body, origin = "capacitor://localhost") {
  return new Request("https://website.test/api/mobile/v1/downloads/assets", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(value) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ identity: "verified", client: "user RLS client" }); mocks.action.mockResolvedValue({ version: 1 }); });
describe("mobile asset HTTP boundary", () => {
  it("requires freshly pinned context and emits no-store CORS", async () => {
    const incoming = request(); const response = await POST(incoming);
    expect(mocks.context).toHaveBeenCalledWith(incoming, true);
    expect(mocks.action).toHaveBeenCalledWith({ identity: "verified", client: "user RLS client", input: body });
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
  });
  it.each([401,403,409])("rejects context failure %s", async status => {
    mocks.context.mockRejectedValue(new MobileApiError(status,"denied","Reopen the matching workspace."));
    expect((await POST(request())).status).toBe(status); expect(mocks.action).not.toHaveBeenCalled();
  });
  it.each([{ ...body, manifestId: "invalid" }, { ...body, objectPath: "caller/path" }, { ...body, version: 2 }])("rejects malformed request %o", async value => {
    expect((await POST(request(value))).status).toBe(400); expect(mocks.action).not.toHaveBeenCalled();
  });
  it("rejects oversized bodies and unsupported origins", async () => {
    expect((await POST(request({ ...body, extra: "x".repeat(5000) }))).status).toBe(413);
    expect((await POST(request(body,"https://evil.test"))).status).toBe(403); expect(mocks.action).not.toHaveBeenCalled();
  });
  it("permits allowed preflight without authentication", async () => {
    expect((await OPTIONS(new Request("https://website.test", { method: "OPTIONS", headers: { Origin: "capacitor://localhost" } }))).status).toBe(204);
    expect(mocks.context).not.toHaveBeenCalled();
  });
});
