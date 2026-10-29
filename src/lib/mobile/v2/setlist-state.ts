import { z } from 'zod';
import { mobileIdentitySchema } from '../contracts';
import { mobileEventRowSchema } from './event-read-models';

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime({ offset: true });
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?$/);

/** Raw database values, including fields the details form does not edit. Never reconstruct an edit base from display labels. */
export const mobileSetlistRowSchema = z.object({
  id: z.uuid(), team_id: z.uuid(), name: z.string(), setlist_date: z.iso.date(), event_id: z.uuid().nullable(),
  location: z.string().nullable(), call_time: clock.nullable(), rehearsal_time: clock.nullable(), service_times: z.array(z.string()),
  notes: z.string().nullable(), leader_member_id: z.uuid().nullable(), presentation_settings: z.json().nullable(),
  created_by: z.uuid(), created_at: timestamp, updated_at: timestamp, deleted_at: timestamp.nullable(), sync_revision: revision,
}).strict();
export const mobileSetlistSlotRowSchema = z.object({
  id: z.uuid(), setlist_id: z.uuid(), song_id: z.uuid(), song_order: z.number().int().positive(),
  assigned_key: z.string(), notes: z.string().nullable(), band_notes: z.string().nullable(), arrangement: z.string().nullable(),
  lead_member_id: z.uuid().nullable(), youtube_url: z.string().nullable(), slide_settings: z.json().nullable(),
  created_at: timestamp, updated_at: timestamp, deleted_at: timestamp.nullable(), sync_revision: revision,
}).strict();
export const mobileSetlistSnapshotSchema = z.object({
  record: mobileSetlistRowSchema,
  slots: z.array(mobileSetlistSlotRowSchema),
  linkedEvent: mobileEventRowSchema.nullable(),
}).strict().superRefine((snapshot, validation) => {
  const ids = snapshot.slots.map(slot => slot.id);
  const positions = snapshot.slots.map(slot => slot.song_order);
  if (new Set(ids).size !== ids.length || new Set(positions).size !== positions.length
    || snapshot.slots.some(slot => slot.setlist_id !== snapshot.record.id || slot.deleted_at !== null)) {
    validation.addIssue({ code: 'custom', message: 'Capture this setlist’s distinct active song slots and positions.' });
  }
  if (snapshot.linkedEvent && (snapshot.linkedEvent.id !== snapshot.record.event_id || snapshot.linkedEvent.team_id !== snapshot.record.team_id)) {
    validation.addIssue({ code: 'custom', message: 'The event snapshot belongs to a different setlist or team.' });
  }
  if (snapshot.record.event_id === null && snapshot.linkedEvent !== null) validation.addIssue({ code: 'custom', message: 'A standalone setlist has no linked event.' });
});
export type MobileSetlistSnapshot = z.infer<typeof mobileSetlistSnapshotSchema>;

export const mobileSetlistSongDisplaySchema = z.object({
  id: z.uuid(), title: z.string(), artist: z.string(), originalKey: z.string(), bpm: z.number().finite().nullable(),
}).strict();
export const mobileSetlistTemplateRowSchema = z.object({
  id: z.uuid(), team_id: z.uuid(), name: z.string(), description: z.string().nullable(), slots: z.json(),
  created_by: z.uuid().nullable(), created_at: timestamp.nullable(),
}).strict();

/** A separate editor cache supplies real aggregate revisions; legacy library display data cannot fabricate these values. */
export const mobileSetlistEditorCacheSchema = z.object({
  version: z.literal(2), identity: mobileIdentitySchema,
  setlists: z.array(mobileSetlistSnapshotSchema),
  availableEvents: z.array(mobileEventRowSchema),
  songs: z.array(mobileSetlistSongDisplaySchema),
  // Additive fields keep earlier schema9 caches readable. Missing template data is unknown, never an empty verified catalog.
  templates: z.array(mobileSetlistTemplateRowSchema).optional(),
  retainedSongs: z.array(mobileSetlistSongDisplaySchema).optional(),
  // Missing in older caches means deletion state is unknown, not a verified empty catalog.
  tombstones: z.array(z.object({ id: z.uuid(), revision }).strict()).optional(),
}).strict().superRefine((cache, validation) => {
  const activeSongIds = new Set(cache.songs.map(song => song.id));
  const referencedSongIds = new Set(cache.setlists.flatMap(setlist => setlist.slots.map(slot => slot.song_id)));
  const linkedEventIds = new Set(cache.setlists.flatMap(setlist => setlist.record.event_id ? [setlist.record.event_id] : []));
  const activeSetlistIds = new Set(cache.setlists.map(row => row.record.id));
  if (new Set(cache.setlists.map(row => row.record.id)).size !== cache.setlists.length
    || new Set(cache.availableEvents.map(row => row.id)).size !== cache.availableEvents.length
    || new Set(cache.songs.map(row => row.id)).size !== cache.songs.length
    || new Set(cache.templates?.map(row => row.id)).size !== (cache.templates?.length ?? 0)
    || new Set(cache.retainedSongs?.map(row => row.id)).size !== (cache.retainedSongs?.length ?? 0)
    || new Set(cache.tombstones?.map(row => row.id)).size !== (cache.tombstones?.length ?? 0)
    || cache.tombstones?.some(row => activeSetlistIds.has(row.id))
    || cache.templates?.some(row => row.team_id !== cache.identity.teamId)
    || cache.retainedSongs?.some(row => activeSongIds.has(row.id) || !referencedSongIds.has(row.id))
    || cache.setlists.some(row => row.record.team_id !== cache.identity.teamId || row.record.deleted_at !== null)
    || cache.availableEvents.some(row => row.team_id !== cache.identity.teamId || row.deleted_at !== null || row.approval_status !== 'approved'
      || linkedEventIds.has(row.id))) {
    validation.addIssue({ code: 'custom', message: 'Setlist editor data must contain distinct, same-team active records and approved unlinked event options.' });
  }
});
export type MobileSetlistEditorCache = z.infer<typeof mobileSetlistEditorCacheSchema>;
