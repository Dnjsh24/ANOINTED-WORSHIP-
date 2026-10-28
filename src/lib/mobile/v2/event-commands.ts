import { z } from "zod";
import { eventInputSchema } from "@/lib/domain/validators";
import { buildEventAssignments, buildEventDetails, eventAssignmentsSchema } from "@/lib/domain/event-workflows";
import { mobileEventRowSchema } from "./event-read-models";
import { mobileWorkflowIdentitySchema } from "./workflow-commands";

export const MOBILE_EVENT_COMMAND_MAX_BYTES = 64 * 1024;
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const mobileEventFormSchema = eventInputSchema.strict().superRefine((value, context) => {
  const assignments = eventAssignmentsSchema.safeParse(buildEventAssignments(value));
  if (!assignments.success) for (const issue of assignments.error.issues) context.addIssue({ code: "custom", message: issue.message, path: ["worshipLeader"] });
  if (!z.uuid().nullable().safeParse(value.linkedSetlistId || null).success) context.addIssue({ code: "custom", message: "Linked setlist ID is invalid.", path: ["linkedSetlistId"] });
});
export const mobileEventLinkedSetlistBaseSchema = z.object({ id: z.uuid(), revision, eventId: z.uuid().nullable() }).strict();
export const mobileEventSnapshotSchema = z.object({
  record: mobileEventRowSchema,
  assignments: eventAssignmentsSchema,
  linkedSetlists: z.array(z.object({ id: z.uuid(), revision }).strict())
    .refine(rows => new Set(rows.map(row => row.id)).size === rows.length),
}).strict();
export type MobileEventSnapshot = z.infer<typeof mobileEventSnapshotSchema>;
const common = { commandId: z.uuid(), eventId: z.uuid(), baseRevision: revision, dependsOn: z.array(z.uuid()).max(25) };
export const mobileEventCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("event.save"), mode: z.enum(["create", "update"]), baseValue: mobileEventSnapshotSchema.nullable(),
    value: mobileEventFormSchema, linkedSetlistBase: mobileEventLinkedSetlistBaseSchema.nullable() }).strict(),
  z.object({ ...common, type: z.literal("event.delete"), baseValue: mobileEventSnapshotSchema }).strict(),
]).superRefine((command, context) => {
  if (command.type === "event.save" && command.mode === "create") {
    if (command.baseRevision !== 0 || command.baseValue !== null) context.addIssue({ code: "custom", message: "A new event has revision zero and no saved base." });
  } else if (!command.baseValue || command.baseValue.record.id !== command.eventId || command.baseValue.record.sync_revision !== command.baseRevision) {
    context.addIssue({ code: "custom", message: "Capture this event's exact saved revision and snapshot." });
  }
  if (command.type === "event.save" && (command.value.linkedSetlistId || null) !== (command.linkedSetlistBase?.id ?? null)) {
    context.addIssue({ code: "custom", message: "Capture the selected setlist's saved revision and event link." });
  }
});
export type MobileEventCommand = z.infer<typeof mobileEventCommandSchema>;
export const mobileEventCommandsRequestSchema = z.object({ version: z.literal(2), commands: z.array(mobileEventCommandSchema).min(1).max(25) }).strict().superRefine((request, context) => {
  const indexes = new Map(request.commands.map((command, index) => [command.commandId, index]));
  if (indexes.size !== request.commands.length) context.addIssue({ code: "custom", message: "Command IDs must be unique." });
  request.commands.forEach((command, index) => {
    if (new Set(command.dependsOn).size !== command.dependsOn.length || command.dependsOn.some(id => (indexes.get(id) ?? -1) >= index)) context.addIssue({ code: "custom", message: "Dependencies must be unique earlier commands or previously applied receipts." });
  });
});
export type MobileEventCommandsRequest = z.infer<typeof mobileEventCommandsRequestSchema>;
const commonResult = { commandId: z.uuid(), type: z.enum(["event.save", "event.delete"]), eventId: z.uuid(), payloadHash: z.string().regex(/^[a-f0-9]{64}$/) };
const occurrence = z.object({ index: z.number().int().min(0).max(12), snapshot: mobileEventSnapshotSchema }).strict();
export const mobileEventResultSchema = z.discriminatedUnion("status", [
  z.object({ ...commonResult, status: z.literal("applied"), snapshot: mobileEventSnapshotSchema.nullable(),
    occurrences: z.array(occurrence).max(13), deletion: z.object({ id: z.uuid(), revision: revision.positive(), deleted: z.literal(true) }).strict().nullable() }).strict(),
  z.object({ ...commonResult, status: z.literal("conflict"), baseValue: mobileEventSnapshotSchema.nullable(), localValue: mobileEventFormSchema.nullable(),
    remote: mobileEventSnapshotSchema.nullable(), linkedSetlist: mobileEventLinkedSetlistBaseSchema.nullable() }).strict(),
  z.object({ ...commonResult, status: z.literal("rejected"), code: z.enum(["permission", "unavailable", "invalid", "command_id_conflict"]), message: z.string().max(250) }).strict(),
  z.object({ ...commonResult, status: z.literal("blocked"), code: z.literal("dependency"), message: z.string().max(250) }).strict(),
]);
export type MobileEventResult = z.infer<typeof mobileEventResultSchema>;
export const mobileEventCommandsResponseSchema = z.object({ version: z.literal(2), identity: mobileWorkflowIdentitySchema, results: z.array(mobileEventResultSchema).min(1).max(25) }).strict();

/** The same website builders define actual writes; templateId is a client-side assignment preset. */
export function prepareMobileEventSave(value: z.infer<typeof mobileEventFormSchema>) {
  const form = mobileEventFormSchema.parse(value);
  return { details: buildEventDetails(form), assignments: eventAssignmentsSchema.parse(buildEventAssignments(form)), linkedSetlistId: form.linkedSetlistId || null };
}

/** Snapshot arrays have stable ordering; never substitute a form value for a saved server base. */
export function canonicalEventSnapshot(snapshot: MobileEventSnapshot): MobileEventSnapshot {
  const checked = mobileEventSnapshotSchema.parse(snapshot);
  return { ...checked, assignments: [...checked.assignments].sort((a, b) => a.assignment.localeCompare(b.assignment) || a.team_member_id.localeCompare(b.team_member_id)),
    linkedSetlists: [...checked.linkedSetlists].sort((a, b) => a.id.localeCompare(b.id)) };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function occurrenceDate(date: string, recurrence: "none"|"weekly"|"biweekly"|"monthly", index: number) {
  const start = new Date(date+"T00:00:00Z");
  if (recurrence === "monthly") {
    const year = start.getUTCFullYear(), month = start.getUTCMonth()+index;
    const end = new Date(start);
    end.setUTCFullYear(year,month+1,0);
    const next = new Date(start);
    next.setUTCFullYear(year,month,Math.min(start.getUTCDate(),end.getUTCDate()));
    return next.toISOString().slice(0,10);
  }
  start.setUTCDate(start.getUTCDate()+index*(recurrence==="weekly"?7:recurrence==="biweekly"?14:0));
  return start.toISOString().slice(0,10);
}

/** One shared boundary for server and native acknowledgements. Throws without accepting any receipt. */
export function assertMobileEventResult(commandInput: MobileEventCommand, identityInput: z.infer<typeof mobileWorkflowIdentitySchema>, result: unknown): MobileEventResult {
  const command=mobileEventCommandSchema.parse(commandInput);
  const identity=mobileWorkflowIdentitySchema.parse(identityInput);
  const response=mobileEventResultSchema.parse(result);
  if (command.baseValue && command.baseValue.record.team_id!==identity.teamId) throw new Error('Event base belongs to another workspace.');
  const invalid=(()=>{
    if (response.commandId!==command.commandId || response.eventId!==command.eventId || response.type!==command.type) return true;
    const validSnapshot=(snapshot: NonNullable<Extract<typeof response,{status:"applied"}>["snapshot"]>)=>snapshot.record.team_id===identity.teamId;
    if (response.status==="conflict") return !same(response.baseValue,command.baseValue)
      || !same(response.localValue,command.type==="event.save"?command.value:null)
      || (response.remote!==null && (!validSnapshot(response.remote)||response.remote.record.id!==command.eventId))
      || (response.linkedSetlist!==null && (command.type!=="event.save" || response.linkedSetlist.id!==command.linkedSetlistBase?.id));
    if (response.status!=="applied") return false;
    if (command.type==="event.delete") return response.snapshot!==null || response.occurrences.length!==0 || response.deletion?.id!==command.eventId || response.deletion.revision<=command.baseRevision;
    if (!response.snapshot || response.snapshot.record.id!==command.eventId || response.deletion!==null || !validSnapshot(response.snapshot)) return true;
    const expected=command.mode==="create"?({none:1,weekly:13,biweekly:7,monthly:4}[command.value.recurrence]):1;
    if (response.occurrences.length!==expected || new Set(response.occurrences.map(row=>row.snapshot.record.id)).size!==expected) return true;
    const prepared=prepareMobileEventSave(command.value);
    return response.occurrences.some((occurrence,n)=>{
      const record=occurrence.snapshot.record;
      const date=occurrenceDate(command.value.date,command.mode==="create"?command.value.recurrence:"none",n);
      const offset=(Date.parse(date+"T00:00:00Z")-Date.parse(command.value.date+"T00:00:00Z"))/86400000;
      const rehearsal=prepared.details.rehearsal_date?new Date(Date.parse(prepared.details.rehearsal_date+"T00:00:00Z")+offset*86400000).toISOString().slice(0,10):null;
      const clock=(value:string|null)=>value === null ? null : value.length===5 ? value+":00" : value;
      return occurrence.index!==n || !validSnapshot(occurrence.snapshot)
        || (n===0 ? !same(occurrence.snapshot,response.snapshot) : record.recurrence_parent_id!==command.eventId)
        || record.deleted_at!==null || record.name!==prepared.details.name || record.type!==prepared.details.type
        || record.event_date!==date || record.rehearsal_date!==rehearsal || clock(record.starts_at)!==clock(prepared.details.starts_at)
        || clock(record.ends_at)!==clock(prepared.details.ends_at) || clock(record.rehearsal_time)!==clock(prepared.details.rehearsal_time)
        || clock(record.rehearsal_end_time)!==clock(prepared.details.rehearsal_end_time)
        || record.location!==prepared.details.location || record.description!==prepared.details.description
        || record.sync_revision<1 || (command.mode==="update" && (record.sync_revision<=command.baseRevision || record.approval_status!==command.baseValue?.record.approval_status))
        || (command.mode==="create" && (record.created_by!==identity.userId || record.approval_status==="rejected"
          || record.recurrence_rule!==(command.value.recurrence==="none"?null:command.value.recurrence) || (n===0 && record.recurrence_parent_id!==null)))
        || (command.mode==="update" && (record.recurrence_rule!==command.baseValue?.record.recurrence_rule || record.recurrence_parent_id!==command.baseValue?.record.recurrence_parent_id))
        || (command.mode==="update" && (record.created_by!==command.baseValue?.record.created_by || record.created_at!==command.baseValue?.record.created_at || record.call_time!==command.baseValue?.record.call_time))
        || (prepared.linkedSetlistId!==null && n===0 && !occurrence.snapshot.linkedSetlists.some(link=>link.id===prepared.linkedSetlistId && link.revision>(command.linkedSetlistBase?.revision??-1)))
        || !same(canonicalEventSnapshot({...occurrence.snapshot,assignments:record.requested_assignments}).assignments,
          canonicalEventSnapshot({...occurrence.snapshot,assignments:record.approval_status==="pending"?prepared.assignments:[]}).assignments)
        || !same(canonicalEventSnapshot(occurrence.snapshot).assignments,
          canonicalEventSnapshot({...occurrence.snapshot,assignments:record.approval_status==="rejected"?[]:prepared.assignments}).assignments);
    });
  })();
  if (invalid) throw new Error('Event confirmation does not match the saved intent and workspace.');
  return response;
}
