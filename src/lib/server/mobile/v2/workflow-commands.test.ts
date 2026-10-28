// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { applyMobileWorkflowCommands } from "./workflow-commands";
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const identity = { userId: id(1), teamId: id(2), memberId: id(3) };
const command = { commandId: id(4), type: "attendance.respond" as const, eventId: id(5), baseRevision: 0, baseEventRevision: 1, baseValue: null, status: "available" as const, dependsOn: [] };
const applied = { commandId: id(4), type: "attendance.respond", eventId: id(5), payloadHash: "a".repeat(64), status: "applied",
  event: { id: id(5), revision: 1, approvalStatus: "approved", deleted: false },
  attendance: { id: id(6), eventId: id(5), memberId: id(3), revision: 1, status: "available", note: null, respondedAt: "2026-10-16T00:00:00Z" }, attendanceRevision: 1 };
function client(response: unknown = [applied], status = 200) {
  const calls: { url: URL; body: unknown }[] = [];
  const database = createClient<Database>("https://workflow.test", "publishable-test-key", { auth: { persistSession: false }, global: { fetch: async (url, init) => {
    calls.push({ url: new URL(String(url)), body: JSON.parse(String(init?.body)) });
    return Response.json(response, { status });
  } } });
  return { database, calls };
}
describe("workflow bearer service", () => {
  it("uses only the named atomic RPC with exact selected member/team and validates the acknowledgement", async () => {
    const { database, calls } = client();
    const selectedIdentity = { ...identity, teamName: "Selected team", role: "member", permissions: [] };
    expect(await applyMobileWorkflowCommands({ client: database, identity: selectedIdentity, request: { version: 2, commands: [command] } })).toMatchObject({ version: 2, identity, results: [applied] });
    expect(calls).toEqual([{ url: new URL("https://workflow.test/rest/v1/rpc/mobile_apply_workflow_commands"), body: { p_team_id: id(2), p_member_id: id(3), p_commands: [command] } }]);
  });
  it.each(["commandId", "eventId"])("rejects mismatched %s acknowledgements", async field => {
    const { database } = client([{ ...applied, [field]: id(99) }]);
    await expect(applyMobileWorkflowCommands({ client: database, identity, request: { version: 2, commands: [command] } })).rejects.toMatchObject({ status: 503 });
  });
  it("rejects another member's RSVP or an unexpected private field", async () => {
    for (const attendance of [{ ...applied.attendance, memberId: id(99) }, { ...applied.attendance, secret: "private" }]) {
      const { database } = client([{ ...applied, attendance }]);
      await expect(applyMobileWorkflowCommands({ client: database, identity, request: { version: 2, commands: [command] } })).rejects.toMatchObject({ status: 503 });
    }
  });
  it("rejects incomplete or semantically different applied/conflict confirmations", async () => {
    for (const response of [
      { ...applied, attendance: null, attendanceRevision: 0 },
      { ...applied, attendance: { ...applied.attendance, status: "maybe" } },
      { ...applied, status: "conflict", baseValue: null, localValue: { status: "unavailable" } },
    ]) {
      await expect(applyMobileWorkflowCommands({ client: client([response]).database, identity, request: { version: 2, commands: [command] } })).rejects.toMatchObject({ status: 503 });
    }
  });
  it.each([["42501", 403], ["40001", 409], ["40P01", 409], ["22023", 400], ["PGRST202", 503]] as const)("maps SQL %s to safe status %s", async (code, status) => {
    const { database } = client({ code, message: "private SQL detail" }, 400);
    await expect(applyMobileWorkflowCommands({ client: database, identity, request: { version: 2, commands: [command] } })).rejects.toMatchObject({ status });
  });
});
