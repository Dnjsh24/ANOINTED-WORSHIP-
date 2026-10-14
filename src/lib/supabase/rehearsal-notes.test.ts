import { describe, expect, it, vi } from "vitest";
import { loadRehearsalNotes } from "./workflow-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function client(data: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const base = { from: vi.fn().mockReturnValue(query) };
  return { base: base as unknown as SupabaseClient<Database>, query, from: base.from };
}

describe("saved rehearsal notes", () => {
  it("reads only this team's setlist and matches allowed song slots, preserving empty notes", async () => {
    const { base, query, from } = client({ allocations: [
      { slot_id: id(1), focus: "Quiet intro", minutes: 5 },
      { slot_id: id(2), focus: "", minutes: 3 },
      { slot_id: id(99), focus: "Unrelated slot", minutes: 5 },
    ] });
    expect(await loadRehearsalNotes(base, id(10), id(20), [id(1), id(2)])).toEqual({ ok: true, data: { [id(1)]: "Quiet intro", [id(2)]: "" } });
    expect(from).toHaveBeenCalledWith("rehearsal_plans");
    expect(query.select).toHaveBeenCalledWith("allocations");
    expect(query.eq.mock.calls).toEqual([["setlist_id", id(20)], ["team_id", id(10)]]);
  });
  it("does not invent notes for a setlist with no saved plan", async () => {
    const { base } = client(null);
    expect(await loadRehearsalNotes(base, id(10), id(20), [id(1)])).toEqual({ ok: true, data: {} });
  });
  it("rejects malformed saved allocations rather than rendering unchecked values", async () => {
    const { base } = client({ allocations: [{ slot_id: id(1), focus: 4, minutes: 5 }] });
    expect(await loadRehearsalNotes(base, id(10), id(20), [id(1)])).toMatchObject({ ok: false, message: expect.stringContaining("could not be read") });
  });
  it("reports query errors without substituting demo data", async () => {
    const { base } = client(null, { code: "42P01" });
    expect(await loadRehearsalNotes(base, id(10), id(20), [id(1)])).toMatchObject({ ok: false, message: expect.stringContaining("migration") });
  });
  it("reports unavailable notes when the query throws", async () => {
    const { base, query } = client(null);
    query.maybeSingle.mockRejectedValue(new Error("Network down"));
    expect(await loadRehearsalNotes(base, id(10), id(20), [id(1)])).toMatchObject({ ok: false, message: expect.stringContaining("could not be loaded") });
  });
});
