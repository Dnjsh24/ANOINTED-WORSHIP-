import { z } from "zod";
import { eventAssignmentsSchema } from "@/lib/domain/event-workflows";
import { rehearsalAllocationSchema, preparationTaskSchema, serviceOrderEntrySchema } from "@/lib/domain/team-workflows";
import { can, type Permission } from "@/lib/domain/rbac";
const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => text(max).min(1);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
const uuid = z.uuid().nullable();
const assignments = z.array(eventAssignmentsSchema.element.strict()).max(100).refine(rows => new Set(rows.map(row => `${row.team_member_id}:${row.assignment}`)).size === rows.length, "Assign each role only once per member.");
const songChanges = z.object({
  title: requiredText(160),
  artist: requiredText(160),
  original_key: requiredText(3),
  bpm: z.number().int().min(40).max(240).nullable(),
  time_signature: z.string().regex(/^\d{1,2}\/\d{1,2}$/),
  lyrics_chords: requiredText(20000),
  youtube_url: text(500).nullable(),
  spotify_url: text(500).nullable(),
  image_url: text(500).nullable(),
  album: text(160).nullable(),
  tags: z.array(requiredText(80)).max(30),
}).partial().strict();
const setlistChanges = z.object({
  name: requiredText(160),
  setlist_date: z.iso.date(),
  location: text(160).nullable(),
  call_time: clock.nullable(),
  rehearsal_time: clock.nullable(),
  service_times: z.array(text(80)).max(20),
  notes: text(2000).nullable(),
  leader_member_id: uuid,
  song_ids: z.array(z.uuid()).max(200),
}).partial().strict();
const eventChanges = z.object({
  name: requiredText(160),
  type: z.enum(["service","rehearsal","meeting","special_event","service_rehearsal"]),
  event_date: z.iso.date(),
  starts_at: clock,
  ends_at: clock.nullable(),
  location: text(160).nullable(),
  description: text(2000).nullable(),
  rehearsal_date: z.iso.date().nullable(),
  rehearsal_time: clock.nullable(),
  rehearsal_end_time: clock.nullable(),
  assignments,
}).partial().strict();
const slotChanges = z.object({
  notes: text(2000).nullable(),
  band_notes: text(4000).nullable(),
  arrangement: text(4000).nullable(),
  assigned_key: requiredText(3),
  lead_member_id: uuid,
  youtube_url: text(500).nullable(),
}).partial().strict();
const announcementChanges = z.object({
  title: requiredText(160),
  body: requiredText(3000),
  category: requiredText(80),
  priority: z.enum(["normal","important","urgent"]),
  is_pinned: z.boolean(),
}).partial().strict();
const reminderChanges = z.object({
  title: requiredText(160),
  body: text(2000).nullable(),
  priority: z.enum(["normal","important","urgent"]),
}).partial().strict();
const choreographyChanges = z.object({
  title: requiredText(160),
  choreography_notes: requiredText(6000),
  formation_notes: text(3000).nullable(),
  outfit_notes: text(2000).nullable(),
  song_title: text(160).nullable(),
  song_artist: text(160).nullable(),
  song_version: text(160).nullable(),
  video_url: text(500).nullable(),
}).partial().strict();
const planChanges = z.object({
  allocations: z.array(rehearsalAllocationSchema).max(200),
  tasks: z.array(preparationTaskSchema).length(10),
}).partial().strict();
const orderChanges = z.object({
  entries: z.array(serviceOrderEntrySchema).max(200),
  required_roles: z.array(requiredText(80)).max(30),
}).partial().strict();
export const sharedEditTargetTypes = ["song","setlist","event","song_slot","announcement","reminder","choreography","rehearsal_plan","service_order"] as const;
export type SharedEditTargetType = typeof sharedEditTargetTypes[number];
const common = { targetId: z.uuid(), revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), reason: requiredText(1000), requestNonce: z.uuid() };
export const sharedEditRequestInputSchema = z.discriminatedUnion("targetType", [
  z.object({ ...common, targetType:z.literal("song"), changes:songChanges }).strict(),
  z.object({ ...common, targetType:z.literal("setlist"), changes:setlistChanges }).strict(),
  z.object({ ...common, targetType:z.literal("event"), changes:eventChanges }).strict(),
  z.object({ ...common, targetType:z.literal("song_slot"), changes:slotChanges }).strict(),
  z.object({ ...common, targetType:z.literal("announcement"), changes:announcementChanges }).strict(),
  z.object({ ...common, targetType:z.literal("reminder"), changes:reminderChanges }).strict(),
  z.object({ ...common, targetType:z.literal("choreography"), changes:choreographyChanges }).strict(),
  z.object({ ...common, targetType:z.literal("rehearsal_plan"), changes:planChanges }).strict(),
  z.object({ ...common, targetType:z.literal("service_order"), changes:orderChanges }).strict(),
]).refine(value => Object.keys(value.changes).length > 0, "Propose at least one changed field.")
  .superRefine((value, context) => {
    if (new TextEncoder().encode(JSON.stringify(value.changes)).byteLength > 262144) context.addIssue({ code: "custom", message: "The proposal is too large." });
    if (value.targetType === "rehearsal_plan") {
      const { allocations, tasks } = value.changes;
      if (allocations && new Set(allocations.map(row => row.slot_id)).size !== allocations.length || tasks && new Set(tasks.map(row => row.key)).size !== tasks.length) context.addIssue({ code: "custom", message: "Each song allocation and preparation task must appear once." });
    }
    if (value.targetType === "service_order") {
      const { entries, required_roles } = value.changes;
      if (entries && new Set(entries.map(row => row.id)).size !== entries.length || required_roles && new Set(required_roles).size !== required_roles.length) context.addIssue({ code: "custom", message: "Order entry IDs and required roles must be unique." });
    }
  });
export type SharedEditRequestInput = z.infer<typeof sharedEditRequestInputSchema>;
export const sharedEditStatusSchema = z.enum(["pending","approved","rejected","withdrawn","needs_revision"]);
export type SharedEditStatus = z.infer<typeof sharedEditStatusSchema>;
export const sharedEditRequestRowSchema = z.object({
  id:z.uuid(), team_id:z.uuid(), target_type:z.enum(sharedEditTargetTypes), target_id:z.uuid(), base_revision:z.number().int(), changes:z.record(z.string(),z.unknown()),
  before_snapshot:z.record(z.string(),z.unknown()), after_snapshot:z.record(z.string(),z.unknown()).nullable(), reason:z.string(), status:sharedEditStatusSchema,
  requested_by:z.uuid(), reviewed_by:z.uuid().nullable(), review_reason:z.string().nullable(), requested_at:z.string(), reviewed_at:z.string().nullable(), request_nonce:z.uuid(), legacy_song_request_id:z.uuid().nullable(),
});
export type SharedEditRequestRow = z.infer<typeof sharedEditRequestRowSchema>;
export const sharedEditTargetSnapshotSchema = z.object({ team_id: z.uuid(), revision: z.number().int().min(0), values: z.record(z.string(), z.unknown()) }).strict();
export type SharedEditTargetSnapshot = z.infer<typeof sharedEditTargetSnapshotSchema>;
export const sharedEditCursorSchema = z.object({ requestedAt: z.iso.datetime({ offset: true }), id: z.uuid() }).strict();
export type SharedEditCursor = z.infer<typeof sharedEditCursorSchema>;
export type SharedEditRequestPage = { ok: true; requests: SharedEditRequestRow[]; nextCursor: SharedEditCursor | null } | { ok: false; message: string };
export const sharedEditReviewerPermissions: Record<SharedEditTargetType, Permission> = {
  song:"songs.review", setlist:"setlists.manage", event:"events.manage", song_slot:"setlists.manage", announcement:"announcements.create", reminder:"members.manage", choreography:"dance_notes.review", rehearsal_plan:"setlists.manage", service_order:"events.manage",
};
export function canReviewSharedEdit(role: string, type: SharedEditTargetType, permissions?: Permission[]) {
  if (type === "song") return role === "owner" || role === "admin";
  return can(role,sharedEditReviewerPermissions[type],permissions);
}
export function canEditSongDirectly(role:string, actorId:string, creatorId:string) { return role === "owner" || role === "admin" || actorId === creatorId; }
