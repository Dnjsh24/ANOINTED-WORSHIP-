import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertMemberRemovalScope, assertMobileMemberRemovalReceipt, mobileMemberRemovalRequestSchema, type MobileMemberRemovalRequest } from '@/lib/mobile/v2/member-removal';
import { MobileApiError } from '../context';
type MemberRemovalDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_member_removal: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; request: MobileMemberRemovalRequest; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'member_removal_access', 'Current owner or admin and member-management authority is required. The saved member removal is retained.');
  if (['22023', '22P02', '22007', '22008', '23514'].includes(code)) return new MobileApiError(400, 'member_removal_validation', 'Review the saved member removal. Its nonce may only retry the original member base.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'member_removal_retry', 'A concurrent role change is in progress. Retry the exact saved member removal.');
  return new MobileApiError(503, 'member_removal_unknown', 'The saved member removal could not be confirmed. Retry the exact saved member removal.');
}
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current owner or admin and member-management authority. The saved member removal is retained.'); }
  try { assertMemberRemovalScope(identity, context.request); } catch { throw failure('42501'); }
}
export async function applyMobileMemberRemoval(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileMemberRemovalRequestSchema.parse(context.request);
  try { assertMemberRemovalScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context);
  const query = (context.client as SupabaseClient<MemberRemovalDatabase>).rpc('mobile_apply_member_removal', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileMemberRemovalReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}
