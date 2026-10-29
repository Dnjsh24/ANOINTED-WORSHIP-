// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mobileWorkflowCommandsRequestSchema, mobileWorkflowResultSchema } from "./workflow-commands";
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const attendance = { commandId: id(1), type: "attendance.respond", eventId: id(2), baseRevision: 0, baseEventRevision: 1, baseValue: null, status: "available", dependsOn: [] };
const review = { commandId: id(3), type: "event.review", eventId: id(2), baseRevision: 1, baseValue: { approvalStatus: "pending" }, decision: "approved", dependsOn: [] };
describe("named v2 workflow command contracts", () => {
  it("supports captured bases, tombstoned attendance bases and ordered/prior receipt dependencies", () => {
    expect(mobileWorkflowCommandsRequestSchema.safeParse({ version: 2, commands: [review, { ...attendance, baseRevision: 4, dependsOn: [id(3), id(4)] }] }).success).toBe(true);
    expect(mobileWorkflowCommandsRequestSchema.safeParse({ version: 2, commands: [{ ...attendance, baseRevision: 1, baseValue: { status: "maybe", note: "May be late" } }] }).success).toBe(true);
  });
  it.each([
    [{ ...attendance, actorId: id(9) }], [{ ...attendance, payloadHash: "claimed" }], [{ ...attendance, type: "team.role.grant" }],
    [{ ...attendance, status: "pending" }], [{ ...attendance, baseRevision: 0, baseValue: { status: "maybe", note: null } }],
    [{ ...review, baseValue: { approvalStatus: "approved" } }], [{ ...attendance, baseRevision: -1 }],
    [attendance, attendance], [{ ...attendance, dependsOn: [id(1)] }], [{ ...attendance, dependsOn: [id(3)] }, review],
  ].map(commands => ({ commands })))("rejects forged/unsupported/ambiguous command batch %#", ({ commands }) => {
    expect(mobileWorkflowCommandsRequestSchema.safeParse({ version: 2, commands }).success).toBe(false);
  });
  it("rejects broad/private metadata in confirmations", () => {
    const response = { commandId: id(1), type: "attendance.respond", eventId: id(2), payloadHash: "a".repeat(64), status: "applied",
      event: { id: id(2), revision: 1, approvalStatus: "approved", deleted: false }, attendance: null, attendanceRevision: 0 };
    expect(mobileWorkflowResultSchema.safeParse(response).success).toBe(true);
    expect(mobileWorkflowResultSchema.safeParse({ ...response, event: { ...response.event, privateDescription: "must not ship" } }).success).toBe(false);
  });
});
