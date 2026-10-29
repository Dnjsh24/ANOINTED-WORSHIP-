import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { assertMobileSupportRequests } from '@/lib/mobile/v2/support-requests';
import { MobileApiError } from '../context';
export async function readMobileSupportRequests(context: { client: SupabaseClient<Database>; userId: string; offset: number; signal?: AbortSignal }) {
  const userId = z.uuid().parse(context.userId); const offset = z.number().int().min(0).max(1_000_000).parse(context.offset);
  context.signal?.throwIfAborted();
  // Support staff receive only their own requester rows on this endpoint too.
  // Team membership and the separate staff inbox never expand this account scope.
  const query = context.client.from('wooly_support_requests').select('id,profile_id,team_id,question,details,page_path,status,created_at,updated_at,requester_read_at,support_updated_at')
    .eq('profile_id', userId).order('updated_at', { ascending: false }).order('id', { ascending: true }).range(offset, offset + 49);
  const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (result.error) throw new MobileApiError(503, 'support_requests_unavailable', 'Your support requests could not be checked. Try again when connected.');
  try { return assertMobileSupportRequests(userId, offset, { version: 2, userId, requests: result.data, offset, fetchedAt: new Date().toISOString() }); }
  catch { throw new MobileApiError(503, 'support_requests_unverified', 'Your support requests could not be verified. Try again when connected.'); }
}
