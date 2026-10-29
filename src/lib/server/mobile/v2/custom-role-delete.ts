import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertCustomRoleDeleteScope, assertMobileCustomRoleDeleteReceipt, mobileCustomRoleDeleteRequestSchema, type MobileCustomRoleDeleteRequest } from '@/lib/mobile/v2/custom-role-delete';
import { MobileApiError } from '../context';
type RoleDeleteDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_custom_role_delete: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; request: MobileCustomRoleDeleteRequest; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'custom_role_delete_access', 'Current owner and team-management authority is required. The saved role deletion is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'custom_role_delete_validation', 'Review the saved role deletion. Its nonce may only retry the original role base.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'custom_role_delete_retry', 'A concurrent role change is in progress. Retry the exact saved role deletion.');
  return new MobileApiError(503, 'custom_role_delete_unknown', 'The saved role deletion could not be confirmed. Retry the exact saved role deletion.');
}
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current owner and team-management authority. The saved role deletion is retained.'); }
  try { assertCustomRoleDeleteScope(identity, context.request); } catch { throw failure('42501'); }
}
export async function applyMobileCustomRoleDelete(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileCustomRoleDeleteRequestSchema.parse(context.request);
  try { assertCustomRoleDeleteScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context);
  const query = (context.client as SupabaseClient<RoleDeleteDatabase>).rpc('mobile_apply_custom_role_delete', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileCustomRoleDeleteReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}
