import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import type { MobileIdentity } from '@/lib/mobile/contracts';
import { mobileSongPurgeRequestSchema, assertSongPurgeScope, assertMobileSongPurgeState, assertMobileSongPurgeReceipt, type MobileSongPurgeRequest } from '@/lib/mobile/v2/song-purge';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { compareSupportReadMarkerTimes } from '@/lib/mobile/v2/support-read-marker';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { MobileApiError } from '../context';
type PurgeDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
 mobile_read_song_purge_state: { Args: { p_team_id: string; p_member_id: string; p_song_id: string | null }; Returns: Json };
 mobile_purge_song: { Args: { p_request: Json }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; signal?: AbortSignal };
const denied = () => new MobileApiError(403, 'song_purge_access', 'Verify the original current owner/admin song deletion authority. Explicit song-edit denial also blocks permanent deletion.');
const unknown = () => new MobileApiError(503, 'song_purge_unconfirmed', 'Permanent deletion is unconfirmed. Keep the original reviewed impact, song base and nonce; refresh when connected.');
function failure(code: string) { if (code === '42501') throw denied(); if (['22023', '22P02', '22007', '22008'].includes(code)) throw new MobileApiError(409, 'song_purge_intent', 'Retry the exact saved purge request. Review the current complete impact before a new intent.'); throw unknown(); }
async function verify(context: Context) { context.signal?.throwIfAborted(); const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted(); try { assertTeamNoticesIdentity(context.identity, { userId: context.identity.userId, ...current }); assertSongPurgeScope(context.identity); } catch { throw denied(); } }
async function postAuthority(context: Context, memberCreatedAt: string) {
 await verify(context);
 const query = (context.client as SupabaseClient<PurgeDatabase>).rpc('mobile_read_song_purge_state', { p_team_id: context.identity.teamId, p_member_id: context.identity.memberId, p_song_id: null });
 const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted(); if (result.error) failure(result.error.code);
 const probe = z.object({ version: z.literal(2), memberCreatedAt: z.iso.datetime({ offset: true }), songId: z.null(), current: z.null(), impact: z.null(), status: z.literal('missing'), fetchedAt: z.iso.datetime({ offset: true }) }).strict().safeParse(result.data);
 if (!probe.success) throw unknown(); if (compareSupportReadMarkerTimes(probe.data.memberCreatedAt, memberCreatedAt) !== 0) throw denied();
}
export async function readMobileSongPurgeState(context: Context & { songId: string }) {
 const songId = z.uuid().parse(context.songId); await verify(context);
 const query = (context.client as SupabaseClient<PurgeDatabase>).rpc('mobile_read_song_purge_state', { p_team_id: context.identity.teamId, p_member_id: context.identity.memberId, p_song_id: songId });
 const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted(); if (result.error) failure(result.error.code);
 let state; try { state = assertMobileSongPurgeState(context.identity, songId, { ...z.record(z.string(), z.unknown()).parse(result.data), identity: context.identity }); } catch { throw unknown(); }
 await postAuthority(context, state.memberCreatedAt); return state;
}
export async function purgeMobileSong(context: Context & { request: MobileSongPurgeRequest }) {
 const request = mobileSongPurgeRequestSchema.parse(context.request); try { assertSongPurgeScope(context.identity, request); } catch { throw denied(); } await verify(context);
 const query = (context.client as SupabaseClient<PurgeDatabase>).rpc('mobile_purge_song', { p_request: request as unknown as Json });
 const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted(); if (result.error) failure(result.error.code);
 let receipt; try { receipt = assertMobileSongPurgeReceipt(context.identity, request, result.data); } catch { throw unknown(); }
 await postAuthority(context, request.memberCreatedAt); return receipt;
}
