import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertPersonPermissionOverrideScope, assertMobilePersonPermissionOverrideReceipt, assertMobilePersonPermissionOverrideState,
  mobilePersonPermissionOverrideRequestSchema, mobilePersonPermissionOverrideSelectionSchema, mobilePersonPermissionOverrideQuerySchema,
  type MobilePersonPermissionOverrideRequest, type MobilePersonPermissionOverrideQuery } from '@/lib/mobile/v2/person-permission-override';
import { MobileApiError } from '../context';
type OverrideDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_person_permission_override: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
  mobile_read_person_permission_override_state: { Args: { p_team_id: string; p_member_id: string; p_target_member_id: string; p_permission: string }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'person_permission_override_access', 'Current team owner and team-management authority is required. The saved person permission change is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'person_permission_override_validation', 'Review the saved person permission change. Its nonce may only retry the original selected override and value.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'person_permission_override_retry', 'A concurrent permission or ownership change is in progress. Retry the exact saved person permission change.');
  return new MobileApiError(503, 'person_permission_override_unknown', 'The person permission change could not be confirmed. Keep the saved request and retry it exactly.');
}
async function verify(context: Context, request?: MobilePersonPermissionOverrideRequest) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current owner authority. The saved person permission change is retained.'); }
  try { assertPersonPermissionOverrideScope(identity, request); } catch { throw failure('42501'); }
}
export async function applyMobilePersonPermissionOverride(context: Context & { request: MobilePersonPermissionOverrideRequest }) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobilePersonPermissionOverrideRequestSchema.parse(context.request);
  try { assertPersonPermissionOverrideScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context, request);
  const query = (context.client as SupabaseClient<OverrideDatabase>).rpc('mobile_apply_person_permission_override', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context, request);
  try { return assertMobilePersonPermissionOverrideReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}
const readResultSchema = z.object({ version: z.literal(2), ...mobilePersonPermissionOverrideQuerySchema.shape, current: mobilePersonPermissionOverrideSelectionSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict();
export async function readMobilePersonPermissionOverrideState(context: Context & { input: MobilePersonPermissionOverrideQuery }) {
  const identity = mobileIdentitySchema.parse(context.identity); const input = mobilePersonPermissionOverrideQuerySchema.parse(context.input);
  try { assertPersonPermissionOverrideScope(identity); } catch { throw failure('42501'); }
  context = { ...context, identity, input }; await verify(context);
  const query = (context.client as SupabaseClient<OverrideDatabase>).rpc('mobile_read_person_permission_override_state', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_target_member_id: input.targetMemberId, p_permission: input.permission });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobilePersonPermissionOverrideState(identity, input, { ...readResultSchema.parse(response.data), identity }); } catch { throw failure('unverified'); }
}
