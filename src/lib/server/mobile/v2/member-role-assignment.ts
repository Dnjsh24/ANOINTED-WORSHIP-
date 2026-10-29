import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertMemberRoleAssignmentScope, assertMobileMemberRoleAssignmentReceipt, assertMobileMemberRoleState, memberRoleAssignmentSnapshotSchema,
  mobileMemberRoleAssignmentRequestSchema, type MobileMemberRoleAssignmentRequest } from '@/lib/mobile/v2/member-role-assignment';
import { MobileApiError } from '../context';
type AssignmentDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_member_role_assignment: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
  mobile_read_member_role_state: { Args: { p_team_id: string; p_member_id: string; p_target_member_id: string }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'member_role_assignment_access', 'Current owner or admin and member-management authority is required. The saved assignment is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'member_role_assignment_validation', 'Review the saved assignment. Its nonce may only retry the original member and role.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'member_role_assignment_retry', 'A concurrent membership change is in progress. Retry the exact saved assignment.');
  return new MobileApiError(503, 'member_role_assignment_unknown', 'The member role could not be confirmed. Keep the saved assignment and retry it exactly.');
}
async function verify(context: Context, request?: MobileMemberRoleAssignmentRequest) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current member-management authority. The saved assignment is retained.'); }
  try { assertMemberRoleAssignmentScope(identity, request); } catch { throw failure('42501'); }
}
export async function applyMobileMemberRoleAssignment(context: Context & { request: MobileMemberRoleAssignmentRequest }) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileMemberRoleAssignmentRequestSchema.parse(context.request);
  try { assertMemberRoleAssignmentScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context, request);
  const query = (context.client as SupabaseClient<AssignmentDatabase>).rpc('mobile_apply_member_role_assignment', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context, request);
  try { return assertMobileMemberRoleAssignmentReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}
const readResultSchema = z.object({ version: z.literal(2), targetMemberId: z.uuid(), current: memberRoleAssignmentSnapshotSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }) }).strict();
export async function readMobileMemberRoleState(context: Context & { targetMemberId: string }) {
  const identity = mobileIdentitySchema.parse(context.identity); const targetMemberId = z.uuid().parse(context.targetMemberId);
  try { assertMemberRoleAssignmentScope(identity); } catch { throw failure('42501'); }
  context = { ...context, identity, targetMemberId }; await verify(context);
  const query = (context.client as SupabaseClient<AssignmentDatabase>).rpc('mobile_read_member_role_state', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_target_member_id: targetMemberId });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileMemberRoleState(identity, targetMemberId, { ...readResultSchema.parse(response.data), identity }); } catch { throw failure('unverified'); }
}
