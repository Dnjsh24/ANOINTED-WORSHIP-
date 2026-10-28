import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileTeamCreationRequestSchema, assertMobileTeamCreationReceipt, type MobileTeamCreationRequest } from '@/lib/mobile/v2/team-creation';
import { MobileApiError } from '../context';
type CreationDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & { mobile_create_team_workspace: { Args: { p_request: Json }; Returns: Json } } } };
export async function applyMobileTeamCreation(context: { client: SupabaseClient<Database>; userId: string; request: MobileTeamCreationRequest; signal?: AbortSignal }) {
  const userId = z.uuid().parse(context.userId); const request = mobileTeamCreationRequestSchema.parse(context.request);
  if (request.userId !== userId) throw new MobileApiError(403, 'team_creation_account', 'Reopen the original account for this saved team creation.');
  context.signal?.throwIfAborted(); const query = (context.client as SupabaseClient<CreationDatabase>).rpc('mobile_create_team_workspace', { p_request: request as unknown as Json });
  const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (result.error) {
    if (['42501', '28000'].includes(result.error.code)) throw new MobileApiError(403, 'team_creation_access', 'Verify the original account before creating a team.');
    if (['22023','22P02','22007','22008','23514'].includes(result.error.code)) throw new MobileApiError(409, 'team_creation_intent', 'Retry the exact saved team creation. A nonce cannot change its reviewed fields.');
    throw new MobileApiError(503, 'team_creation_unconfirmed', 'Team creation is unconfirmed. Keep the saved request and retry it exactly.');
  }
  try { return assertMobileTeamCreationReceipt(userId, request, result.data); }
  catch { throw new MobileApiError(503, 'team_creation_unverified', 'The team creation receipt could not be verified. Keep the original request.'); }
}
