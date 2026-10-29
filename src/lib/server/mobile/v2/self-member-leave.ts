import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { assertSelfMemberLeaveScope, assertMobileSelfMemberLeaveReceipt, assertMobileSelfMemberLeaveState, mobileSelfMemberLeaveScopeSchema,
  mobileSelfMemberLeaveRequestSchema, mobileSelfMemberLeaveQuerySchema, type MobileSelfMemberLeaveScope, type MobileSelfMemberLeaveRequest,
  type MobileSelfMemberLeaveQuery } from '@/lib/mobile/v2/self-member-leave';
import { MobileApiError } from '../context';
type LeaveDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_self_member_leave: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
  mobile_read_self_member_leave_state: { Args: { p_team_id: string; p_member_id: string; p_request_nonce: string | null }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; scope: MobileSelfMemberLeaveScope; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'self_member_leave_access', 'The original membership or sealed departure could not be verified. Keep the saved departure.');
  if (['22023', '22P02', '22007', '22008', '23514'].includes(code)) return new MobileApiError(400, 'self_member_leave_validation', 'Review the exact saved departure and confirmation. Its nonce cannot change intent.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'self_member_leave_retry', 'A membership change is in progress. Retry the exact saved departure.');
  return new MobileApiError(503, 'self_member_leave_unknown', 'Departure could not be confirmed. Keep the saved request and retry it exactly.');
}
export async function applyMobileSelfMemberLeave(context: Context & { request: MobileSelfMemberLeaveRequest }) {
  const scope = mobileSelfMemberLeaveScopeSchema.parse(context.scope); const request = mobileSelfMemberLeaveRequestSchema.parse(context.request);
  try { assertSelfMemberLeaveScope(scope, request); } catch { throw failure('42501'); }
  context.signal?.throwIfAborted();
  const query = (context.client as SupabaseClient<LeaveDatabase>).rpc('mobile_apply_self_member_leave', { p_team_id: scope.teamId, p_member_id: scope.memberId, p_request: request as unknown as Json });
  const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (result.error) throw failure(result.error.code);
  try { return assertMobileSelfMemberLeaveReceipt(scope, request, result.data); } catch { throw failure('unverified'); }
}
export async function readMobileSelfMemberLeaveState(context: Context & { input: MobileSelfMemberLeaveQuery }) {
  const scope = mobileSelfMemberLeaveScopeSchema.parse(context.scope); const input = mobileSelfMemberLeaveQuerySchema.parse(context.input); context.signal?.throwIfAborted();
  const query = (context.client as SupabaseClient<LeaveDatabase>).rpc('mobile_read_self_member_leave_state', { p_team_id: scope.teamId, p_member_id: scope.memberId, p_request_nonce: input.requestNonce ?? null });
  const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (result.error) throw failure(result.error.code);
  try { return assertMobileSelfMemberLeaveState(scope, input, result.data); } catch { throw failure('unverified'); }
}
