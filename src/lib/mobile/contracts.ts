import { z } from "zod";
import { eventAssignmentsSchema } from "@/lib/domain/event-workflows";
import { PERMISSION_LABELS, type Permission } from "@/lib/domain/rbac";

export const MOBILE_API_VERSION = 1 as const;
export const MOBILE_COMMAND_BATCH_BYTES = 3 * 1024 * 1024;
export const MOBILE_REQUEST_MAX_BYTES = 4 * 1024 * 1024;
export const mobileEntityTypes = ["song", "setlist", "arrangement", "event", "dance", "annotation"] as const;
export type MobileEntityType = typeof mobileEntityTypes[number];
const text = (maximum: number) => z.string().max(maximum);
const name = text(160).min(1);
const nullableId = z.uuid().nullable();
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/);
const song = z.object({
  title: name, artist: name, original_key: text(3).min(1), bpm: z.number().int().min(40).max(240).nullable(),
  time_signature: z.string().regex(/^\d{1,2}\/\d{1,2}$/), lyrics_chords: text(20000),
  youtube_url: text(500).nullable(), spotify_url: text(500).nullable(), image_url: text(500).nullable(),
  album: text(160).nullable(), tags: z.array(text(80).min(1)).max(30),
}).strict();
const setlist = z.object({
  name, setlist_date: z.iso.date(), event_id: nullableId, location: text(160).nullable(),
  call_time: clock.nullable(), rehearsal_time: clock.nullable(), service_times: z.array(text(80)).max(20),
  notes: text(2000).nullable(), leader_member_id: nullableId, song_ids: z.array(z.uuid()).max(200),
}).strict();
const arrangement = z.object({
  setlist_id: z.uuid(), song_id: z.uuid(), song_order: z.number().int().min(1).max(200),
  assigned_key: text(3).min(1), notes: text(2000).nullable(), band_notes: text(4000).nullable(),
  arrangement: text(4000).nullable(), lead_member_id: nullableId, youtube_url: text(500).nullable(),
}).strict();
const event = z.object({
  name, type: z.enum(["service", "rehearsal", "meeting", "special_event", "service_rehearsal"]),
  event_date: z.iso.date(), starts_at: clock, ends_at: clock.nullable(), location: text(160).nullable(),
  description: text(2000).nullable(), rehearsal_date: z.iso.date().nullable(), rehearsal_time: clock.nullable(),
  rehearsal_end_time: clock.nullable(), assignments: eventAssignmentsSchema,
}).strict();
const dance = z.object({
  title: name, song_id: nullableId, event_id: nullableId, choreography_notes: text(6000).nullable(),
  formation_notes: text(3000).nullable(), outfit_notes: text(2000).nullable(), song_title: text(160).nullable(),
  song_artist: text(160).nullable(), song_version: text(160).nullable(), video_url: text(500).nullable(),
}).strict();
const chartNote = z.object({
  id: text(100), text: text(4000), x: z.number().finite().min(0), y: z.number().finite().min(0),
  font: z.enum(["sans", "serif", "mono"]), fontSize: z.number().int().min(12).max(72),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), bold: z.boolean(), italic: z.boolean(),
  underline: z.boolean(), strike: z.boolean(),
}).strict();
const annotation = z.object({
  song_id: z.uuid(), setlist_id: nullableId, slot_id: nullableId,
  notes: z.array(chartNote).max(100), drawing: text(180000).regex(/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/).nullable(),
}).strict().refine(value => Boolean(value.setlist_id) === Boolean(value.slot_id), "Setlist and slot must be supplied together.");
export const mobileValueSchemas = { song, setlist, arrangement, event, dance, annotation };
export type MobileValueMap = { [K in MobileEntityType]: z.infer<typeof mobileValueSchemas[K]> };
export type MobileLiveRecord = { [K in MobileEntityType]: {
  entityType: K; id: string; revision: number; value: MobileValueMap[K]; deleted?: false;
} }[MobileEntityType];
export type MobileTombstone = { entityType: MobileEntityType; id: string; revision: number; value: null; deleted: true };
export type MobileRecord = MobileLiveRecord | MobileTombstone;
export type MobileCommand = { [K in MobileEntityType]: {
  commandId: string; entityType: K; entityId: string; baseRevision: number;
  baseValue: MobileValueMap[K] | null; value: MobileValueMap[K]; operation?: "upsert" | "delete";
} }[MobileEntityType];
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const commandEnvelope = z.object({ commandId: z.uuid(), entityType: z.enum(mobileEntityTypes), entityId: z.uuid(),
  baseRevision: revision, baseValue: z.unknown().nullable(), value: z.unknown(), operation: z.enum(["upsert", "delete"]).optional() }).strict();
export const mobileCommandsRequestSchema = z.object({ version: z.literal(1), commands: z.array(commandEnvelope).min(1).max(25) }).strict()
  .superRefine((request, context) => {
    for (const [index, command] of request.commands.entries()) {
      for (const field of ["baseValue", "value"] as const) {
        if (field === "baseValue" && command[field] === null) continue;
        if (!mobileValueSchemas[command.entityType].safeParse(command[field]).success) {
          context.addIssue({ code: "custom", message: "Invalid entity value.", path: ["commands", index, field] });
        }
      }
      if (command.baseValue === null && command.baseRevision !== 0) context.addIssue({ code: "custom", message: "New records have revision zero.", path: ["commands", index] });
    }
    if (new Set(request.commands.map(command => command.commandId)).size !== request.commands.length) context.addIssue({ code: "custom", message: "Command IDs must be unique." });
  }).transform(request => request as { version: 1; commands: MobileCommand[] });
export const mobileSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("library") }).strict(),
  z.object({ kind: z.enum(["song", "setlist", "event"]), id: z.uuid() }).strict(),
]);
export type MobileSelection = z.infer<typeof mobileSelectionSchema>;
export const mobileCursorSchema = z.object({ entityType: z.enum(mobileEntityTypes), id: z.uuid() }).strict();
export type MobileCursor = z.infer<typeof mobileCursorSchema>;
export const mobileDownloadRequestSchema = z.object({ version: z.literal(1), selection: mobileSelectionSchema,
  cursor: mobileCursorSchema.optional(), manifestId: z.uuid().optional() }).strict();
export type MobileIdentity = { userId: string; teamId: string; memberId: string; teamName: string; role: string; permissions: Permission[] };
export type MobileBootstrap = { version: 1; identity: MobileIdentity; records: MobileRecord[] };
export type MobileDownload = MobileBootstrap & { manifestId: string; nextCursor: MobileCursor | null };
export type MobileMutationResult =
  | { commandId: string; status: "applied"; record: MobileRecord }
  | { commandId: string; status: "conflict"; baseValue: MobileCommand["baseValue"]; localValue: MobileCommand["value"]; remote: MobileRecord; fields: string[] }
  | { commandId: string; status: "rejected"; code: string; message: string };
export type MobileCommandsResponse = { version: 1; results: MobileMutationResult[] };

export const mobileIdentitySchema = z.object({
  userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), teamName: text(160).min(1), role: text(80).min(1),
  permissions: z.array(z.enum(Object.keys(PERMISSION_LABELS) as Permission[])).max(100),
}).strict();
const recordFields = { id: z.uuid(), revision, deleted: z.literal(false).optional() };
export const mobileLiveRecordSchema = z.discriminatedUnion("entityType", [
  z.object({ ...recordFields, entityType: z.literal("song"), value: song }).strict(),
  z.object({ ...recordFields, entityType: z.literal("setlist"), value: setlist }).strict(),
  z.object({ ...recordFields, entityType: z.literal("arrangement"), value: arrangement }).strict(),
  z.object({ ...recordFields, entityType: z.literal("event"), value: event }).strict(),
  z.object({ ...recordFields, entityType: z.literal("dance"), value: dance }).strict(),
  z.object({ ...recordFields, entityType: z.literal("annotation"), value: annotation }).strict(),
]);
export const mobileRecordSchema = z.union([mobileLiveRecordSchema,
  z.object({ entityType: z.enum(mobileEntityTypes), id: z.uuid(), revision, value: z.null(), deleted: z.literal(true) }).strict(),
]);
export const mobileBootstrapSchema = z.object({ version: z.literal(1), identity: mobileIdentitySchema, records: z.array(mobileRecordSchema).max(250) }).strict();
export const mobileDownloadSchema = mobileBootstrapSchema.extend({ manifestId: z.uuid(), nextCursor: mobileCursorSchema.nullable() }).strict();
export const mobileMutationResultSchema = z.discriminatedUnion("status", [
  z.object({ commandId: z.uuid(), status: z.literal("applied"), record: mobileRecordSchema }).strict(),
  z.object({ commandId: z.uuid(), status: z.literal("conflict"), baseValue: z.unknown().nullable(), localValue: z.unknown(), remote: mobileRecordSchema, fields: z.array(text(100)).max(30) }).strict()
    .superRefine((result, context) => {
      for (const field of ["baseValue", "localValue"] as const) {
        if (field === "baseValue" && result[field] === null) continue;
        if (!mobileValueSchemas[result.remote.entityType].safeParse(result[field]).success) context.addIssue({ code: "custom", message: "Invalid retained conflict version.", path: [field] });
      }
    }),
  z.object({ commandId: z.uuid(), status: z.literal("rejected"), code: text(64), message: text(300) }).strict(),
]);
export const mobileCommandsResponseSchema = z.object({ version: z.literal(1), results: z.array(mobileMutationResultSchema).max(25) }).strict();
