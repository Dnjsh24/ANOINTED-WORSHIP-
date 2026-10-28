import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertCustomRoleCreateScope, assertMobileCustomRoleCreateReceipt, mobileCustomRoleCreateRequestSchema, type MobileCustomRoleCreateRequest } from '@/lib/mobile/v2/custom-role-create';
import { MobileApiError } from '../context';
type RoleCreateDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_custom_role_create: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; request: MobileCustomRoleCreateRequest; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'custom_role_create_access', 'Current owner and team-management authority is required. The saved role creation is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'custom_role_create_validation', 'Review the saved role creation. Its nonce may only retry the original name and permissions.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'custom_role_create_retry', 'A concurrent role change is in progress. Retry the exact saved role creation.');
  return new MobileApiError(503, 'custom_role_create_unknown', 'The saved role creation could not be confirmed. Retry the exact saved role creation.');
}
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current owner and team-management authority. The saved role creation is retained.'); }
  try { assertCustomRoleCreateScope(identity, context.request); } catch { throw failure('42501'); }
}
export async function applyMobileCustomRoleCreate(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileCustomRoleCreateRequestSchema.parse(context.request);
  try { assertCustomRoleCreateScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context);
  const query = (context.client as SupabaseClient<RoleCreateDatabase>).rpc('mobile_apply_custom_role_create', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileCustomRoleCreateReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}



