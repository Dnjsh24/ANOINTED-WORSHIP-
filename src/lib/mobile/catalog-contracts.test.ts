import { describe, expect, it } from "vitest";
import { mobileCatalogRequestSchema, mobileCatalogResponseSchema } from "./catalog-contracts";

const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const identity = { userId: id(1), teamId: id(2), memberId: id(3), teamName: "Team", role: "member", permissions: [] };
describe("mobile catalog wire contract", () => {
  it("accepts all catalog kinds, trims search, and validates keyset cursors", () => {
    for (const kind of ["song", "setlist", "event"]) {
      expect(mobileCatalogRequestSchema.parse({ version: 1, kind, search: "  Grace  ", after: id(7) })).toEqual({ version: 1, kind, search: "Grace", after: id(7) });
    }
  });
  it.each([
    { version: 2, kind: "song" }, { version: 1, kind: "annotation" }, { version: 1, kind: "song", after: "other-team" },
    { version: 1, kind: "song", search: "x".repeat(121) }, { version: 1, kind: "song", search: "a\u0000b" },
    { version: 1, kind: "song", teamId: id(2) }, { version: 1, kind: "song", limit: 500 },
  ])("rejects malformed or unowned query fields: %o", input => expect(mobileCatalogRequestSchema.safeParse(input).success).toBe(false));
  it("bounds and validates public response items", () => {
    const item = { kind: "song", id: id(5), title: "Grace", subtitle: null };
    expect(mobileCatalogResponseSchema.safeParse({ version: 1, identity, items: [item], nextId: null }).success).toBe(true);
    expect(mobileCatalogResponseSchema.safeParse({ version: 1, identity, items: Array(51).fill(item), nextId: id(5) }).success).toBe(false);
    expect(mobileCatalogResponseSchema.safeParse({ version: 1, identity, items: [{ ...item, id: "invalid" }], nextId: null }).success).toBe(false);
  });
});
