import { z } from "zod";
import { preparationGroups } from "@/lib/domain/rehearsal-plan";

export const preparationTaskKeys: string[] = preparationGroups.flatMap(group => [...group.tasks]);
export const rehearsalAllocationSchema = z.object({
  slot_id: z.uuid(), minutes: z.number().int().min(0).max(120), focus: z.string().max(500),
}).strict();
export const preparationTaskSchema = z.object({
  key: z.string().refine(value => preparationTaskKeys.includes(value)), assignee_member_id: z.uuid().nullable(),
}).strict();
export const rehearsalPlanInputSchema = z.object({
  setlistId: z.uuid(), revision: z.number().int().min(0),
  allocations: z.array(rehearsalAllocationSchema).max(200),
  tasks: z.array(preparationTaskSchema).length(10),
}).strict().superRefine((value, context) => {
  if (new Set(value.tasks.map(task => task.key)).size !== 10 || new Set(value.allocations.map(row => row.slot_id)).size !== value.allocations.length) {
    context.addIssue({ code: "custom", message: "Each task and song slot must appear once." });
  }
});
export const serviceOrderEntrySchema = z.object({
  id: z.uuid(), kind: z.enum(["song", "prayer", "reading", "announcement", "media", "other"]),
  title: z.string().trim().min(1).max(160), slot_id: z.uuid().nullable(),
  duration_seconds: z.number().int().min(0).max(7200), responsible_member_id: z.uuid().nullable(), cue: z.string().max(2000),
}).strict().refine(row => (row.kind === "song") === (row.slot_id !== null), "Song entries require a linked setlist slot.");
export const serviceOrderInputSchema = z.object({
  eventId: z.uuid(), revision: z.number().int().min(0), entries: z.array(serviceOrderEntrySchema).max(200),
  requiredRoles: z.array(z.string().trim().min(1).max(80)).max(30),
}).strict().superRefine((value, context) => {
  if (new Set(value.entries.map(row => row.id)).size !== value.entries.length || new Set(value.requiredRoles).size !== value.requiredRoles.length) {
    context.addIssue({ code: "custom", message: "Order item IDs and required roles must be unique." });
  }
});
export const readinessStateSchema = z.enum(["not_started", "practicing", "ready", "needs_help"]);
export const assignmentStateSchema = z.enum(["pending", "confirmed", "declined"]);
export type RehearsalAllocationRow = z.infer<typeof rehearsalAllocationSchema>;
export type PreparationTask = z.infer<typeof preparationTaskSchema>;
export type ServiceOrderEntry = z.infer<typeof serviceOrderEntrySchema>;
export type ReadinessState = z.infer<typeof readinessStateSchema>;
export type AssignmentState = z.infer<typeof assignmentStateSchema>;

export function defaultPreparationTasks(): PreparationTask[] {
  return preparationTaskKeys.map(key => ({ key, assignee_member_id: null }));
}

export function serviceOrderTimeline(startsAt: string, entries: ServiceOrderEntry[]) {
  const [hours, minutes] = startsAt.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return [];
  let seconds = hours * 3600 + minutes * 60;
  return entries.map(entry => {
    const day = Math.floor(seconds / 86400);
    const clock = `${String(Math.floor(seconds / 3600) % 24).padStart(2, "0")}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}`;
    seconds += entry.duration_seconds;
    return { ...entry, plannedStart: `${clock}${day ? ` (+${day} day)` : ""}` };
  });
}

export function missingRequiredRoles(required: string[], assignments: { assignment: string; state?: AssignmentState }[]) {
  const covered = new Set(assignments.filter(row => row.state !== "declined").map(row => row.assignment));
  return required.filter(role => !covered.has(role));
}

const templateRoleLabels: Record<string, string> = {
  worshipLeader: "Worship Leader", acousticGuitar: "Acoustic Guitar", electricGuitar: "Electric Guitar",
  bass: "Bass", drums: "Drums", mainKeys: "Main Keys", secondKeys: "Second Keys", extraBandMembers: "Band Member",
  backupSingers: "Backup Singer", media: "Media", dancers: "Dancers",
};
export function requiredRolesFromTemplate(defaultRoles: unknown): string[] {
  if (!defaultRoles || typeof defaultRoles !== "object" || Array.isArray(defaultRoles)) return [];
  return Object.keys(defaultRoles).flatMap(key => templateRoleLabels[key] ? [templateRoleLabels[key]] : []);
}

export function buildServiceOrderExport(name: string, startsAt: string, entries: ServiceOrderEntry[], members: { id: string; name: string }[]) {
  const names = new Map(members.map(member => [member.id, member.name]));
  const lines = [name, "Service running order (planned times)", ""];
  serviceOrderTimeline(startsAt, entries).forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.plannedStart} | ${entry.title} (${entry.kind}) | ${entry.duration_seconds / 60} min`);
    if (entry.responsible_member_id) lines.push(`Responsible: ${names.get(entry.responsible_member_id) ?? "Unavailable member"}`);
    if (entry.cue.trim()) lines.push(`Cue: ${entry.cue.trim()}`);
  });
  return lines.join("\n");
}
