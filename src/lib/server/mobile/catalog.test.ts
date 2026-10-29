// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { readMobileCatalog } from "./catalog";

vi.mock("./context", () => ({ MobileApiError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } } }));
const id = (last: number) => `10000000-0000-4000-8000-${String(last).padStart(12, "0")}`;
const identity = { userId: id(1), teamId: id(2), memberId: id(3), teamName: "Team", role: "member", permissions: [] };
function database(rows: unknown[], status = 200) {
  const urls: URL[] = [];
  const client = createClient<Database>("https://test.supabase.co", "publishable-test-key", {
    auth: { persistSession: false }, global: { fetch: async (input) => {
      urls.push(new URL(String(input)));
      return new Response(JSON.stringify(status === 200 ? rows : { message: "secret tenant SQL failure", code: "42501" }), { status, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { client, urls };
}
describe("mobile catalog scoped read queries", () => {
  it("filters verified team, song moderation and Trash without downloading content", async () => {
    const db = database([{ id: id(5), title: "Grace", artist: "Team artist" }]);
    expect(await readMobileCatalog({ ...db, identity, input: { version: 1, kind: "song" } })).toMatchObject({ items: [{ kind: "song", id: id(5), title: "Grace", subtitle: "Team artist" }], nextId: null });
    const query = db.urls[0].searchParams;
    expect(db.urls[0].pathname).toBe("/rest/v1/songs");
    expect(query.get("select")).toBe("id,title,artist");
    expect(query.get("team_id")).toBe(`eq.${identity.teamId}`);
    expect(query.get("status")).toBe("eq.approved");
    expect(query.get("deleted_at")).toBe("is.null");
    expect(query.get("order")).toBe("id.asc");
    expect(query.get("limit")).toBe("51");
  });
  it("uses each fresh team identity rather than a caller-supplied team selector", async () => {
    for (const teamId of [id(2), id(22)]) {
      const db = database([]);
      await readMobileCatalog({ ...db, identity: { ...identity, teamId }, input: { version: 1, kind: "setlist" } });
      expect(db.urls[0].searchParams.get("team_id")).toBe(`eq.${teamId}`);
    }
  });
  it("probes one extra row and returns a cursor at the last included UUID", async () => {
    const db = database(Array.from({ length: 51 }, (_, index) => ({ id: id(index + 10), title: `Song ${index}`, artist: "" })));
    const result = await readMobileCatalog({ ...db, identity, input: { version: 1, kind: "song", after: id(9) } });
    expect(result.items).toHaveLength(50);
    expect(result.nextId).toBe(id(59));
    expect(db.urls[0].searchParams.get("id")).toBe(`gt.${id(9)}`);
    expect(result.items[0].subtitle).toBeNull();
  });
  it("returns no cursor on an exact 50-row final page", async () => {
    const db = database(Array.from({ length: 50 }, (_, index) => ({ id: id(index + 10), name: `Plan ${index}`, setlist_date: "2026-10-18" })));
    expect((await readMobileCatalog({ ...db, identity, input: { version: 1, kind: "setlist" } })).nextId).toBeNull();
  });
  it.each(["member", "band_leader", "pastor"])("keeps pending event visibility to creator for %s", async role => {
    const db = database([{ id: id(5), name: "Service", event_date: "2026-10-18" }]);
    const result = await readMobileCatalog({ ...db, identity: { ...identity, role }, input: { version: 1, kind: "event" } });
    expect(db.urls[0].searchParams.get("or")).toBe(`(approval_status.eq.approved,created_by.eq.${identity.userId})`);
    expect(db.urls[0].searchParams.get("deleted_at")).toBe("is.null");
    expect(result.items[0]).toEqual({ kind: "event", id: id(5), title: "Service", subtitle: "2026-10-18" });
  });
  it.each(["owner", "admin"])("retains website event-review visibility for %s", async role => {
    const db = database([]);
    await readMobileCatalog({ ...db, identity: { ...identity, role }, input: { version: 1, kind: "event" } });
    expect(db.urls[0].searchParams.has("or")).toBe(false);
    expect(db.urls[0].searchParams.get("team_id")).toBe(`eq.${identity.teamId}`);
  });
  it("quotes filter syntax and escapes regex metacharacters while keeping percent and underscore literal", async () => {
    const search = '50%_ "Grace",(Live).*\\';
    const escaped = JSON.stringify('50%_ "Grace",\\(Live\\)\\.\\*\\\\');
    const songs = database([]);
    await readMobileCatalog({ ...songs, identity, input: { version: 1, kind: "song", search } });
    expect(songs.urls[0].searchParams.get("or")).toBe(`(title.imatch.${escaped},artist.imatch.${escaped})`);
    const plans = database([]);
    await readMobileCatalog({ ...plans, identity, input: { version: 1, kind: "setlist", search } });
    expect(plans.urls[0].searchParams.get("name")).toBe(`imatch.${JSON.parse(escaped)}`);
  });
  it.each(["song", "setlist", "event"] as const)("returns safe unavailable errors for denied %s reads", async kind => {
    const db = database([], 403);
    await expect(readMobileCatalog({ ...db, identity, input: { version: 1, kind } })).rejects.toMatchObject({ status: 503, code: "unavailable", message: "The download catalog is unavailable. Try again later." });
  });
  it.each(["song", "setlist", "event"] as const)("validates untrusted %s database rows", async kind => {
    const db = database([{ id: "not-a-uuid", title: "Invalid", name: "Invalid" }]);
    await expect(readMobileCatalog({ ...db, identity, input: { version: 1, kind } })).rejects.toMatchObject({ status: 503, code: "unavailable" });
  });
});
