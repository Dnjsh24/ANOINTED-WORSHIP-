import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/database.types';
import { jsonEqual } from '../json-equal';
import { mobileEventRowSchema } from './event-read-models';
import { EventReadError, eventReadColumns, readEventPages, verifyEventReadAccess, type ReadEventsOptions } from './read-events';
import { mobileSetlistEditorCacheSchema, mobileSetlistRowSchema, mobileSetlistSlotRowSchema, mobileSetlistTemplateRowSchema, type MobileSetlistEditorCache } from './setlist-state';

const setlistColumns = 'id,team_id,name,setlist_date,event_id,location,call_time,rehearsal_time,service_times,notes,leader_member_id,presentation_settings,created_by,created_at,updated_at,deleted_at,sync_revision';
const slotColumns = 'id,setlist_id,song_id,song_order,assigned_key,notes,band_notes,arrangement,lead_member_id,youtube_url,slide_settings,created_at,updated_at,deleted_at,sync_revision';
const templateColumns = 'id,team_id,name,description,slots,created_by,created_at';
const deletionRowSchema = z.object({
  team_id: z.uuid(), entity_type: z.literal('setlist'), entity_id: z.uuid(),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), actor_id: z.uuid().nullable(),
}).strict();
// Read-only extension for the existing mobile deletion table; do not invent records if it is unavailable.
type SetlistDeletionDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Tables: Database['public']['Tables'] & {
  mobile_deleted_records: { Row: z.infer<typeof deletionRowSchema>; Insert: never; Update: never; Relationships: [] };
} } };
const songRowSchema = z.object({
  id: z.uuid(), team_id: z.uuid(), title: z.string(), artist: z.string(), original_key: z.string(), bpm: z.number().finite().nullable(),
  status: z.string(), deleted_at: z.iso.datetime({ offset: true }).nullable(),
}).strict();
export type ReadSetlistEditorOptions = ReadEventsOptions & { teamName: string };

/** Uses the existing scoped, authenticated native-query adapter. A stable read window is not a global database snapshot. */
export async function readSetlistEditorContext(options: ReadSetlistEditorOptions): Promise<MobileSetlistEditorCache> {
  const pageSize = options.pageSize ?? 100;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new EventReadError('Setlist editor page size must be between 1 and 500.');
  const teamName = z.string().min(1).max(160).safeParse(options.teamName);
  if (!teamName.success) throw new EventReadError('The setlist team name is invalid.');
  const verified = await verifyEventReadAccess(options, pageSize);
  const { client, signal } = options;
  const deletionClient = client as SupabaseClient<SetlistDeletionDatabase>;
  const { identity, role } = verified;
  const readCatalogs = async () => {
    const [setlistRows, events, songs, templates, deletions] = await Promise.all([
      readEventPages(mobileSetlistRowSchema, row => row.id, after => {
        // Include soft-deleted parents that may predate mobile deletion tracking.
        let query = client.from('setlists').select(setlistColumns).eq('team_id', identity.teamId).order('id').limit(pageSize);
        if (after) query = query.gt('id', after);
        return signal ? query.abortSignal(signal) : query;
      }, pageSize, signal),
      readEventPages(mobileEventRowSchema, row => row.id, after => {
        let query = client.from('events').select(eventReadColumns).eq('team_id', identity.teamId).is('deleted_at', null).order('id').limit(pageSize);
        if (after) query = query.gt('id', after);
        return signal ? query.abortSignal(signal) : query;
      }, pageSize, signal),
      readEventPages(songRowSchema, row => row.id, after => {
        // Match the website form: visible same-team songs; the workspace RPC rejects deleted songs.
        // Retain accessible deleted song labels separately for existing slot history, never as new choices.
        let query = client.from('songs').select('id,team_id,title,artist,original_key,bpm,status,deleted_at').eq('team_id', identity.teamId).order('id').limit(pageSize);
        if (after) query = query.gt('id', after);
        return signal ? query.abortSignal(signal) : query;
      }, pageSize, signal),
      readEventPages(mobileSetlistTemplateRowSchema, row => row.id, after => {
        let query = client.from('setlist_templates').select(templateColumns).eq('team_id', identity.teamId).order('id').limit(pageSize);
        if (after) query = query.gt('id', after);
        return signal ? query.abortSignal(signal) : query;
      }, pageSize, signal),
      readEventPages(deletionRowSchema, row => row.entity_id, after => {
        let query = deletionClient.from('mobile_deleted_records').select('team_id,entity_type,entity_id,revision,actor_id')
          .eq('team_id', identity.teamId).eq('entity_type', 'setlist').order('entity_id').limit(pageSize);
        if (after) query = query.gt('entity_id', after);
        return signal ? query.abortSignal(signal) : query;
      }, pageSize, signal),
    ]);
    if ([...setlistRows, ...events, ...songs, ...templates, ...deletions].some(row => row.team_id !== identity.teamId)
      || deletions.some(row => row.actor_id !== null && row.actor_id !== identity.userId)
      || events.some(row => row.deleted_at !== null || (row.approval_status !== 'approved' && row.created_by !== identity.userId && role !== 'owner' && role !== 'admin'))) {
      throw new EventReadError('Setlist editor records do not belong to this accessible workspace.', 403);
    }
    return { setlists: setlistRows.filter(row => row.deleted_at === null),
      softDeletedSetlists: setlistRows.filter(row => row.deleted_at !== null).map(row => ({ id: row.id, revision: row.sync_revision })),
      events, songs, templates, deletions };
  };
  const initial = await readCatalogs();
  const slots: z.infer<typeof mobileSetlistSlotRowSchema>[] = [];
  const seenSlots = new Set<string>();
  for (let start = 0; start < initial.setlists.length; start += 50) {
    const ids = initial.setlists.slice(start, start + 50).map(row => row.id);
    const rows = await readEventPages(mobileSetlistSlotRowSchema, row => row.id, after => {
      let query = client.from('setlist_songs').select(slotColumns).in('setlist_id', ids).is('deleted_at', null).order('id').limit(pageSize);
      if (after) query = query.gt('id', after);
      return signal ? query.abortSignal(signal) : query;
    }, pageSize, signal);
    if (rows.some(row => !ids.includes(row.setlist_id) || row.deleted_at !== null || seenSlots.has(row.id))) throw new EventReadError('A setlist song slot has an unavailable or repeated parent identity.');
    for (const row of rows) seenSlots.add(row.id);
    slots.push(...rows);
  }
  // Child writes advance the setlist aggregate revision. Template/song/event changes also invalidate this preparation.
  const current = await readCatalogs();
  if (!jsonEqual(initial, current)) throw new EventReadError('Setlists or editor choices changed during preparation. Retry without discarding saved drafts.', 409);
  const currentAccess = await verifyEventReadAccess(options, pageSize);
  if (currentAccess.fingerprint !== verified.fingerprint) throw new EventReadError('Workspace permissions changed while preparing setlists. Refresh the verified context and retry.', 409);
  const slotsBySetlist = new Map<string, typeof slots>();
  const referencedSongs = new Set(slots.map(slot => slot.song_id));
  for (const slot of slots) {
    const group = slotsBySetlist.get(slot.setlist_id) ?? [];
    group.push(slot); slotsBySetlist.set(slot.setlist_id, group);
  }
  const eventsById = new Map(initial.events.map(event => [event.id, event]));
  const linkedEventIds = new Set(initial.setlists.flatMap(row => row.event_id ? [row.event_id] : []));
  const songs = initial.songs.filter(song => song.deleted_at === null);
  const retainedSongs = initial.songs.filter(song => song.deleted_at !== null && referencedSongs.has(song.id));
  const display = (row: z.infer<typeof songRowSchema>) => ({ id: row.id, title: row.title, artist: row.artist, originalKey: row.original_key, bpm: row.bpm });
  const tombstones = new Map(initial.softDeletedSetlists.map(row => [row.id, row.revision]));
  for (const row of initial.deletions) tombstones.set(row.entity_id, Math.max(row.revision, tombstones.get(row.entity_id) ?? 0));
  const cache = mobileSetlistEditorCacheSchema.safeParse({
    version: 2, identity: { ...verified.authorization, teamName: teamName.data },
    setlists: initial.setlists.map(record => ({ record,
      slots: (slotsBySetlist.get(record.id) ?? []).sort((left, right) => left.song_order - right.song_order || left.id.localeCompare(right.id)),
      linkedEvent: record.event_id ? eventsById.get(record.event_id) ?? null : null,
    })),
    availableEvents: initial.events.filter(event => event.approval_status === 'approved' && !linkedEventIds.has(event.id))
      .sort((left, right) => left.event_date.localeCompare(right.event_date) || left.starts_at.localeCompare(right.starts_at) || left.id.localeCompare(right.id)),
    songs: songs.map(display).sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)),
    retainedSongs: retainedSongs.map(display),
    tombstones: [...tombstones].map(([id, revision]) => ({ id, revision })).sort((left, right) => left.id.localeCompare(right.id)),
    templates: [...initial.templates].sort((left, right) => {
      // Match the website's created_at DESC query, including PostgreSQL's default NULLS FIRST.
      if (left.created_at === null) return right.created_at === null ? left.id.localeCompare(right.id) : -1;
      if (right.created_at === null) return 1;
      return right.created_at.localeCompare(left.created_at) || left.id.localeCompare(right.id);
    }),
  });
  if (!cache.success) throw new EventReadError('Setlist editor data is inconsistent. Existing drafts remain saved.');
  return cache.data;
}
