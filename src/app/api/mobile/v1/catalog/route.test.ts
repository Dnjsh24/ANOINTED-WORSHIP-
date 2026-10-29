// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), readCatalog: vi.fn() }));
vi.mock("@/lib/server/mobile/context", () => ({
  requireMobileContext: mocks.context,
  MobileApiError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } },
}));
vi.mock("@/lib/server/mobile/catalog", () => ({ readMobileCatalog: mocks.readCatalog }));
import { MobileApiError } from "@/lib/server/mobile/context";
import { OPTIONS, POST } from "./route";

const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const identity = { userId: id(1), teamId: id(2), memberId: id(3), teamName: "Team", role: "member", permissions: [] };
const catalog = { version: 1, identity, items: [], nextId: null };
function request(body: unknown = { version: 1, kind: "song" }, headers: HeadersInit = {}) {
  return new Request("https://website.example/api/mobile/v1/catalog", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "capacitor://localhost", ...headers }, body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ identity, client: "authenticated RLS client" });
  mocks.readCatalog.mockResolvedValue(catalog);
});
describe("mobile catalog HTTP boundary", () => {
  it("requires fresh pinned account/team context and returns no-store CORS JSON", async () => {
    const incoming = request({ version: 1, kind: "setlist", search: "  Sunday  ", after: id(4) });
    const response = await POST(incoming);
    expect(mocks.context).toHaveBeenCalledWith(incoming, true);
    expect(mocks.readCatalog).toHaveBeenCalledWith({ identity, client: "authenticated RLS client", input: { version: 1, kind: "setlist", search: "Sunday", after: id(4) } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(catalog);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
  });
  it.each([[401, "session"], [403, "membership"], [409, "scope_changed"]] as const)("denies %s context failures before querying records", async (status, code) => {
    mocks.context.mockRejectedValue(new MobileApiError(status, code, "Reopen the matching account."));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ version: 1, error: { code, message: "Reopen the matching account." } });
    expect(mocks.readCatalog).not.toHaveBeenCalled();
  });
  it.each([
    { version: 1, kind: "song", after: "invalid" }, { version: 1, kind: "library" },
    { version: 1, kind: "event", teamId: id(99) }, { version: 1, kind: "song", search: "x".repeat(121) },
  ])("rejects malformed query %o without a catalog read", async body => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mocks.readCatalog).not.toHaveBeenCalled();
  });
  it("rejects oversized bodies before accessing records", async () => {
    const response = await POST(request({ version: 1, kind: "song", search: "x".repeat(5000) }));
    expect(response.status).toBe(413);
    expect(mocks.readCatalog).not.toHaveBeenCalled();
  });
  it("rejects unsupported origins before verification or a catalog read", async () => {
    const response = await POST(request(undefined, { Origin: "https://attacker.example" }));
    expect(response.status).toBe(403);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.readCatalog).not.toHaveBeenCalled();
  });
  it("returns safe errors without raw database details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.readCatalog.mockRejectedValue(new Error("secret SQL schema and tenant details"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    log.mockRestore();
  });
  it("permits allowed preflight without requiring a Bearer session", async () => {
    const response = await OPTIONS(new Request("https://website.example/api/mobile/v1/catalog", { method: "OPTIONS", headers: { Origin: "capacitor://localhost" } }));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Mobile-Team-Id");
    expect(mocks.context).not.toHaveBeenCalled();
  });
});
