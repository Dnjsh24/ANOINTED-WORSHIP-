import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileSupportRequestCloseRequestSchema, assertMobileSupportRequestCloseReceipt, type MobileSupportRequestCloseRequest } from '@/lib/mobile/v2/support-request-close';
import { MobileApiError } from '../context';
type CloseDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & { mobile_close_support_request: { Args: { p_request: Json }; Returns: Json } } } };
export async function applyMobileSupportRequestClose(context: { client: SupabaseClient<Database>; userId: string; request: MobileSupportRequestCloseRequest; signal?: AbortSignal }) {
  const userId = z.uuid().parse(context.userId); const request = mobileSupportRequestCloseRequestSchema.parse(context.request);
  if (request.userId !== userId) throw new MobileApiError(403, 'support_close_access', 'Reopen the original account before closing this support request.');
  context.signal?.throwIfAborted(); const query = (context.client as SupabaseClient<CloseDatabase>).rpc('mobile_close_support_request', { p_request: request as unknown as Json });
  const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (result.error) {
    if (result.error.code === '42501') throw new MobileApiError(403, 'support_close_access', 'Only your own support request can be closed. Keep the saved intent.');
    if (['22023', '22P02', '22007', '22008'].includes(result.error.code)) throw new MobileApiError(409, 'support_close_conflict', 'Retry the exact original close intent. Its nonce cannot change snapshots.');
    throw new MobileApiError(503, 'support_close_unconfirmed', 'Close is unconfirmed. Keep the saved intent and retry it exactly.');
  }
  try { return assertMobileSupportRequestCloseReceipt(userId, request, result.data); }
  catch { throw new MobileApiError(503, 'support_close_unverified', 'The close receipt could not be verified. Keep the saved intent.'); }
}
