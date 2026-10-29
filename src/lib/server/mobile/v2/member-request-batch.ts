import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertMemberRequestBatchScope, assertMobileMemberRequestBatchReceipt, mobileMemberRequestBatchRequestSchema, type MobileMemberRequestBatchRequest } from '@/lib/mobile/v2/member-request-batch';
import { MobileApiError } from '../context';
type BatchDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_member_request_batch: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; request: MobileMemberRequestBatchRequest; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'member_request_access', 'Current review, member-management and role-assignment authority is required. The saved batch is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'member_request_validation', 'Review the saved batch. Its nonce may only retry the original requests and bases.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'member_request_retry', 'A concurrent membership change is in progress. Retry the exact saved batch.');
  return new MobileApiError(503, 'member_request_unknown', 'The review could not be confirmed. Retry the exact saved batch.');
}
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current request-review authority. The saved batch is retained.'); }
  try { assertMemberRequestBatchScope(identity, context.request); } catch { throw failure('42501'); }
}
export async function applyMobileMemberRequestBatch(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileMemberRequestBatchRequestSchema.parse(context.request);
  try { assertMemberRequestBatchScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context);
  const query = (context.client as SupabaseClient<BatchDatabase>).rpc('mobile_apply_member_request_batch', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileMemberRequestBatchReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}

