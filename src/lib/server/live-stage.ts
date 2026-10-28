import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { liveStageRequestSchema, liveStageResponseSchema, type LiveStageRequest, type LiveStageResponse } from '@/lib/domain/live-stage';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { jsonEqual } from '@/lib/mobile/json-equal';
import { MobileApiError } from '@/lib/mobile/errors';

type LiveDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  stage_live_cursor: { Args: { p_team_id: string; p_member_id: string; p_setlist_id: string; p_request: Json }; Returns: Json };
} } };
function failure(code: string) {
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) return new MobileApiError(code === '42501' ? 403 : 401, 'permission', 'Current Stage membership or broadcast permission is unavailable.');
  if (['40001', '40P01'].includes(code)) return new MobileApiError(409, 'live_stage_changed', 'The live Stage session changed. Stop broadcasting and explicitly restart when ready.');
  if (['22023', '22P02', '23514', '22003'].includes(code)) return new MobileApiError(400, 'validation', 'Review this live Stage cursor and song order.');
  return new MobileApiError(503, 'unavailable', 'Live Stage is unavailable. Reconnect and explicitly restart broadcasting when ready.');
}
export async function applyLiveStageRequest(input: { client: SupabaseClient<Database>; identity: z.infer<typeof mobileWorkflowIdentitySchema>;
  setlistId: string; request: LiveStageRequest; signal?: AbortSignal }): Promise<LiveStageResponse> {
  const identity = mobileWorkflowIdentitySchema.parse({ userId: input.identity.userId, teamId: input.identity.teamId, memberId: input.identity.memberId });
  const setlistId = z.uuid().parse(input.setlistId);
  const request = liveStageRequestSchema.parse(input.request);
  input.signal?.throwIfAborted();
  const query = (input.client as SupabaseClient<LiveDatabase>).rpc('stage_live_cursor', {
    p_team_id: identity.teamId, p_member_id: identity.memberId, p_setlist_id: setlistId, p_request: request as Json,
  });
  const response = await (input.signal ? query.abortSignal(input.signal) : query);
  input.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  const parsed = liveStageResponseSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.teamId !== identity.teamId || parsed.data.setlistId !== setlistId) throw failure('unverified');
  const state = parsed.data.state;
  if (state && !jsonEqual(state.orderedSlotIds, request.orderedSlotIds)) throw failure('unverified');
  if (request.action !== 'read') {
    if (parsed.data.fenceSessionId !== request.sessionId) throw failure('unverified');
    if (request.action === 'release' ? state !== null : !state || state.sessionId !== request.sessionId || state.publisherMemberId !== identity.memberId
      || (request.action !== 'claim' && state.sequence !== request.sequence) || (request.action === 'publish' && !jsonEqual(state.cursor, request.cursor))) throw failure('unverified');
  }
  return parsed.data;
}
