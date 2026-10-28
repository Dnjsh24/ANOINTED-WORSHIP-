import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertCustomRoleRetirementScope, assertMobileCustomRoleRetirementReceipt, assertMobileCustomRoleRetirementState,
  mobileCustomRoleRetirementRequestSchema, mobileCustomRoleRetirementSelectionSchema, 
  type MobileCustomRoleRetirementRequest } from '@/lib/mobile/v2/custom-role-retirement';
import { MobileApiError } from '../context';
type OverrideDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_custom_role_retirement: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
  mobile_read_custom_role_retirement_state: { Args: { p_team_id: string; p_member_id: string; p_role_id: string }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'custom_role_retirement_access', 'Current team owner and team-management authority is required. The saved role retirement is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'custom_role_retirement_validation', 'Review the saved role retirement. Its nonce may only retry the original selected override and value.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'custom_role_retirement_retry', 'A concurrent permission or ownership change is in progress. Retry the exact saved role retirement.');
  return new MobileApiError(503, 'custom_role_retirement_unknown', 'The role retirement could not be confirmed. Keep the saved request and retry it exactly.');
}
async function verify(context: Context, request?: MobileCustomRoleRetirementRequest) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current owner authority. The saved role retirement is retained.'); }
  try { assertCustomRoleRetirementScope(identity, request); } catch { throw failure('42501'); }
}
export async function applyMobileCustomRoleRetirement(context: Context & { request: MobileCustomRoleRetirementRequest }) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileCustomRoleRetirementRequestSchema.parse(context.request);
  try { assertCustomRoleRetirementScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context, request);
  const query = (context.client as SupabaseClient<OverrideDatabase>).rpc('mobile_apply_custom_role_retirement', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context, request);
  try { return assertMobileCustomRoleRetirementReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}
const readResultSchema = z.object({ version: z.literal(2), roleId: z.uuid(), current: mobileCustomRoleRetirementSelectionSchema.nullable(), assignedCount: z.number().int().nonnegative(), reason: z.literal('member_limit').nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict();
export async function readMobileCustomRoleRetirementState(context: Context & { roleId: string }) {
  const identity = mobileIdentitySchema.parse(context.identity); const roleId = z.uuid().parse(context.roleId);
  try { assertCustomRoleRetirementScope(identity); } catch { throw failure('42501'); }
  context = { ...context, identity, roleId }; await verify(context);
  const query = (context.client as SupabaseClient<OverrideDatabase>).rpc('mobile_read_custom_role_retirement_state', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_role_id: roleId });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileCustomRoleRetirementState(identity, roleId, { ...readResultSchema.parse(response.data), identity }); } catch { throw failure('unverified'); }
}
