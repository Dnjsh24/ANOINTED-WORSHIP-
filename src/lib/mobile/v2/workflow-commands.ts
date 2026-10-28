import { z } from "zod";

export const MOBILE_WORKFLOW_COMMAND_MAX_BYTES = 64 * 1024;
export const MOBILE_WORKFLOW_COMMAND_BATCH_SIZE = 25;
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const approval = z.enum(["pending", "approved", "rejected"]);
const attendanceStatus = z.enum(["available", "maybe", "unavailable", "pending"]);
export const workflowAttendanceBaseSchema = z.object({ status: attendanceStatus, note: z.string().nullable() }).strict();
const common = { commandId: z.uuid(), eventId: z.uuid(), baseRevision: revision, dependsOn: z.array(z.uuid()).max(25) };
export const mobileWorkflowCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("attendance.respond"), baseEventRevision: revision, baseValue: workflowAttendanceBaseSchema.nullable(), status: z.enum(["available", "maybe", "unavailable"]) }).strict(),
  z.object({ ...common, type: z.literal("event.review"), baseValue: z.object({ approvalStatus: z.literal("pending") }).strict(), decision: z.enum(["approved", "rejected"]) }).strict(),
]);
export type MobileWorkflowCommand = z.infer<typeof mobileWorkflowCommandSchema>;
export const mobileWorkflowCommandsRequestSchema = z.object({ version: z.literal(2), commands: z.array(mobileWorkflowCommandSchema).min(1).max(MOBILE_WORKFLOW_COMMAND_BATCH_SIZE) }).strict().superRefine((request, context) => {
  const indexes = new Map(request.commands.map((command, index) => [command.commandId, index]));
  if (indexes.size !== request.commands.length) context.addIssue({ code: "custom", message: "Command IDs must be unique." });
  request.commands.forEach((command, index) => {
    if (new Set(command.dependsOn).size !== command.dependsOn.length || command.dependsOn.some(id => (indexes.get(id) ?? -1) >= index)) {
      context.addIssue({ code: "custom", path: ["commands", index, "dependsOn"], message: "Dependencies must be unique earlier commands or previously applied receipts." });
    }
    if (command.type === "attendance.respond" && command.baseRevision === 0 && command.baseValue !== null) {
      context.addIssue({ code: "custom", path: ["commands", index, "baseValue"], message: "A new RSVP has no saved base value." });
    }
  });
});
export type MobileWorkflowCommandsRequest = z.infer<typeof mobileWorkflowCommandsRequestSchema>;
export const workflowEventStateSchema = z.object({ id: z.uuid(), revision, approvalStatus: approval, deleted: z.boolean() }).strict();
export const workflowOwnAttendanceSchema = z.object({
  id: z.uuid(), eventId: z.uuid(), memberId: z.uuid(), revision: revision.positive(), status: attendanceStatus,
  note: z.string().nullable(), respondedAt: z.iso.datetime({ offset: true }).nullable(),
}).strict();
const resultCommon = { commandId: z.uuid(), type: z.enum(["attendance.respond", "event.review"]), eventId: z.uuid(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/) };
const state = { event: workflowEventStateSchema, attendance: workflowOwnAttendanceSchema.nullable(), attendanceRevision: revision };
export const mobileWorkflowResultSchema = z.discriminatedUnion("status", [
  z.object({ ...resultCommon, status: z.literal("applied"), ...state }).strict(),
  z.object({ ...resultCommon, status: z.literal("conflict"), ...state,
    baseValue: z.union([workflowAttendanceBaseSchema, z.object({ approvalStatus: z.literal("pending") }).strict()]).nullable(),
    localValue: z.union([z.object({ status: z.enum(["available", "maybe", "unavailable"]) }).strict(), z.object({ decision: z.enum(["approved", "rejected"]) }).strict()]),
  }).strict(),
  z.object({ ...resultCommon, status: z.literal("rejected"), code: z.enum(["permission", "unavailable", "invalid", "command_id_conflict"]), message: z.string().max(250) }).strict(),
  z.object({ ...resultCommon, status: z.literal("blocked"), code: z.literal("dependency"), message: z.string().max(250) }).strict(),
]);
export type MobileWorkflowResult = z.infer<typeof mobileWorkflowResultSchema>;
export const mobileWorkflowIdentitySchema = z.object({ userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid() }).strict();
export const mobileWorkflowCommandsResponseSchema = z.object({ version: z.literal(2), identity: mobileWorkflowIdentitySchema, results: z.array(mobileWorkflowResultSchema).min(1).max(MOBILE_WORKFLOW_COMMAND_BATCH_SIZE) }).strict();
export type MobileWorkflowCommandsResponse = z.infer<typeof mobileWorkflowCommandsResponseSchema>;

// SQL hashes canonical jsonb text; caller-supplied hashes are never trusted. Keep the original command/ID for retry.
// Rejected, blocked and conflict receipts are immutable. Resolving their cause requires a new command ID.
// Attendance baseRevision 0/null means never observed; a deleted RSVP may have a later revision with a null base.
