import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, mobileValueSchemas, type MobileIdentity } from '@/lib/mobile/contracts';
import { assertMobileSongEditorContext, type MobileSongEditorContext } from '@/lib/mobile/v2/song-editor';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { readEventPages } from '@/lib/mobile/v2/read-events';
import { resolvePermissionOverrides } from '@/lib/domain/permission-overrides';
import { canEditSongDirectly } from '@/lib/domain/shared-edit-requests';
import { sameJson } from '@/lib/mobile/v2/dance-proposals';
import { MobileApiError } from '../context';
export type SongEditorContext = { client: SupabaseClient<Database>; identity: MobileIdentity; songId: string; signal?: AbortSignal };
const unavailable = () => new MobileApiError(503, 'song_editor_unconfirmed', 'Song ownership or edit overrides could not be verified. Keep your saved work and refresh when connected.');
const changed = () => new MobileApiError(409, 'song_editor_changed', 'Song or current editing authority changed. Refresh its confirmed base before starting another edit.');
const overrideSchema = z.object({ id: z.uuid(), team_id: z.uuid(), role: z.string().nullable(), member_id: z.uuid().nullable(), permission: z.literal('songs.edit'), allowed: z.boolean() }).strict().refine(row => (row.role === null) !== (row.member_id === null));
const songRowSchema = z.object({ id: z.uuid(), team_id: z.uuid(), created_by: z.uuid(), created_at: z.iso.datetime({ offset: true }), sync_revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), status: z.literal('approved'), deleted_at: z.null(), ...mobileValueSchemas.song.shape }).strict();
export async function verifyMobileSongEditorAccess(context: SongEditorContext) {
 context.signal?.throwIfAborted();
 const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
 try { assertTeamNoticesIdentity(context.identity, { userId: context.identity.userId, ...current }); } catch { throw changed(); }
 let rows: z.infer<typeof overrideSchema>[] = [];
 if (current.role !== 'owner') {
  try {
   // Reuse the protected reader's fail-closed cursor paging. Empty exhaustion,
   // rather than a short page, proves that a server cap did not hide a deny.
   rows = await readEventPages(overrideSchema, row => row.id, after => {
    let query = context.client.from('team_permission_overrides').select('id,team_id,role,member_id,permission,allowed').eq('team_id', context.identity.teamId).eq('permission', 'songs.edit').or(`role.eq.${current.role},member_id.eq.${current.memberId}`).order('id').limit(100);
    if (after) query = query.gt('id', after); return context.signal ? query.abortSignal(context.signal) : query;
   }, 100, context.signal);
  } catch { context.signal?.throwIfAborted(); throw unavailable(); }
 }
 if (rows.some(row => row.team_id !== context.identity.teamId || row.role !== null && row.role !== current.role || row.member_id !== null && row.member_id !== current.memberId) || new Set(rows.map(row => row.role ?? row.member_id)).size !== rows.length) throw unavailable();
 const overrides = resolvePermissionOverrides(rows, current.role, current.memberId);
 return { editOverride: overrides['songs.edit'] ?? null, fingerprint: JSON.stringify(rows) };
}
async function song(context: SongEditorContext) {
 const query = context.client.from('songs').select('id,team_id,created_by,created_at,sync_revision,status,deleted_at,title,artist,original_key,bpm,time_signature,lyrics_chords,youtube_url,spotify_url,image_url,album,tags').eq('team_id', context.identity.teamId).eq('id', context.songId).eq('status', 'approved').is('deleted_at', null);
 const result = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle(); context.signal?.throwIfAborted();
 if (result.error) throw result.error.code === '42501' ? new MobileApiError(403, 'song_editor_access', 'Current selected team song access is required.') : unavailable();
 if (result.data === null) throw new MobileApiError(404, 'song_editor_unavailable', 'This approved active song is unavailable. Keep your saved work.');
 const parsed = songRowSchema.safeParse(result.data);
 if (!parsed.success || parsed.data.id !== context.songId || parsed.data.team_id !== context.identity.teamId) throw unavailable();
 return parsed.data;
}
/** Read-only preparation; neither a database snapshot nor an incarnation-bound writer. */
export async function readMobileSongEditorContext(context: SongEditorContext): Promise<MobileSongEditorContext> {
 context = { ...context, identity: mobileIdentitySchema.parse(context.identity), songId: z.uuid().parse(context.songId) };
 const initialAccess = await verifyMobileSongEditorAccess(context), initialSong = await song(context);
 const finalSong = await song(context), finalAccess = await verifyMobileSongEditorAccess(context);
 if (!sameJson(initialSong, finalSong) || initialAccess.fingerprint !== finalAccess.fingerprint) throw changed();
 const { id, team_id, created_by, created_at, sync_revision, status: ignoredStatus, deleted_at: ignoredDeleted, ...value } = finalSong; void ignoredStatus; void ignoredDeleted;
 const direct = canEditSongDirectly(context.identity.role, context.identity.userId, created_by, finalAccess.editOverride === null ? {} : { 'songs.edit': finalAccess.editOverride });
 try { return assertMobileSongEditorContext(context.identity, context.songId, { version: 2, identity: context.identity, song: { id, teamId: team_id, createdBy: created_by, createdAt: created_at, revision: sync_revision, value }, authorization: { direct, propose: !direct, editOverride: finalAccess.editOverride }, fetchedAt: new Date().toISOString() }); } catch { throw unavailable(); }
}
