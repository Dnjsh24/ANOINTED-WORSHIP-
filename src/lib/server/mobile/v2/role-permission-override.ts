import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertRolePermissionOverrideScope, assertMobileRolePermissionOverrideReceipt, assertMobileRolePermissionOverrideState,
  mobileRolePermissionOverrideRequestSchema, mobileRolePermissionOverrideRowSchema, mobileRolePermissionOverrideQuerySchema,
  type MobileRolePermissionOverrideRequest, type MobileRolePermissionOverrideQuery } from '@/lib/mobile/v2/role-permission-override';
import { MobileApiError } from '../context';
type OverrideDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_role_permission_override: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
  mobile_read_role_permission_override_state: { Args: { p_team_id: string; p_member_id: string; p_target_role: string; p_permission: string }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'role_permission_override_access', 'Current team owner and team-management authority is required. The saved role permission change is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'role_permission_override_validation', 'Review the saved role permission change. Its nonce may only retry the original selected override and value.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'role_permission_override_retry', 'A concurrent permission or ownership change is in progress. Retry the exact saved role permission change.');
  return new MobileApiError(503, 'role_permission_override_unknown', 'The role permission change could not be confirmed. Keep the saved request and retry it exactly.');
}
async function verify(context: Context, request?: MobileRolePermissionOverrideRequest) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current owner authority. The saved role permission change is retained.'); }
  try { assertRolePermissionOverrideScope(identity, request); } catch { throw failure('42501'); }
}
export async function applyMobileRolePermissionOverride(context: Context & { request: MobileRolePermissionOverrideRequest }) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileRolePermissionOverrideRequestSchema.parse(context.request);
  try { assertRolePermissionOverrideScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context, request);
  const query = (context.client as SupabaseClient<OverrideDatabase>).rpc('mobile_apply_role_permission_override', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context, request);
  try { return assertMobileRolePermissionOverrideReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}
const readResultSchema = z.object({ version: z.literal(2), ...mobileRolePermissionOverrideQuerySchema.shape, current: mobileRolePermissionOverrideRowSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict();
export async function readMobileRolePermissionOverrideState(context: Context & { input: MobileRolePermissionOverrideQuery }) {
  const identity = mobileIdentitySchema.parse(context.identity); const input = mobileRolePermissionOverrideQuerySchema.parse(context.input);
  try { assertRolePermissionOverrideScope(identity); } catch { throw failure('42501'); }
  context = { ...context, identity, input }; await verify(context);
  const query = (context.client as SupabaseClient<OverrideDatabase>).rpc('mobile_read_role_permission_override_state', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_target_role: input.targetRole, p_permission: input.permission });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileRolePermissionOverrideState(identity, input, { ...readResultSchema.parse(response.data), identity }); } catch { throw failure('unverified'); }
}
