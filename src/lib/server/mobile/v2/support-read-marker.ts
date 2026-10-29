import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileSupportReadMarkerRequestSchema, compareSupportReadMarkerTimes, assertMobileSupportReadMarkerResponse, type MobileSupportReadMarkerRequest } from '@/lib/mobile/v2/support-read-marker';
import { MobileApiError } from '../context';
type Context = { client: SupabaseClient<Database>; userId: string; request: MobileSupportReadMarkerRequest; signal?: AbortSignal };
const rowSchema = z.object({ id: z.uuid(), profile_id: z.uuid(), created_at: z.iso.datetime({ offset: true }), support_updated_at: z.iso.datetime({ offset: true }).nullable(), requester_read_at: z.iso.datetime({ offset: true }) }).strict();
const denied = () => new MobileApiError(403, 'support_read_marker_access', 'Your own support thread and displayed reply timestamp could not be verified.');
const unavailable = () => new MobileApiError(503, 'support_read_marker_unconfirmed', 'The read marker could not be confirmed. Refresh your own thread before trying again.');
async function ownSnapshot(context: Context) {
  context.signal?.throwIfAborted();
  const query = context.client.from('wooly_support_requests').select('id,profile_id,created_at,support_updated_at,requester_read_at').eq('id', context.request.requestId).eq('profile_id', context.userId);
  const result = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle(); context.signal?.throwIfAborted();
  if (result.error) throw unavailable(); if (result.data === null) throw denied();
  const row = rowSchema.safeParse(result.data); if (!row.success) throw unavailable();
  if (row.data.id !== context.request.requestId || row.data.profile_id !== context.userId) throw denied(); return row.data;
}
export async function applyMobileSupportReadMarker(context: Context) {
  const request = mobileSupportReadMarkerRequestSchema.parse(context.request); const userId = z.uuid().parse(context.userId);
  if (request.userId !== userId) throw denied(); context = { ...context, userId, request };
  const before = await ownSnapshot(context);
  if (compareSupportReadMarkerTimes(request.readUntil, before.support_updated_at ?? before.created_at) > 0) throw denied();
  const query = context.client.rpc('read_wooly_support_request', { p_id: request.requestId, p_read_until: request.readUntil });
  await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  // A missing reply can still be confirmed by the authoritative own-row marker.
  // Never substitute a newer support timestamp for the user's displayed snapshot.
  const after = await ownSnapshot(context);
  try { return assertMobileSupportReadMarkerResponse(userId, request, { ...request, observedReadAt: after.requester_read_at, fetchedAt: new Date().toISOString() }); }
  catch { throw unavailable(); }
}
