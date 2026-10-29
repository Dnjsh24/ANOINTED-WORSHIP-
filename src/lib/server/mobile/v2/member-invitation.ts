import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertMemberInvitationScope, assertMobileMemberInvitationReceipt, mobileMemberInvitationRequestSchema, type MobileMemberInvitationRequest } from '@/lib/mobile/v2/member-invitation';
import { MobileApiError } from '../context';
type InvitationDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_member_invitation: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; request: MobileMemberInvitationRequest; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'member_invitation_access', 'Current member-management and role-assignment authority is required. The saved invitation is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'member_invitation_validation', 'Review the saved invitation. Its nonce may only retry the original email, role and message.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'member_invitation_retry', 'A concurrent invitation change is in progress. Retry the exact saved invitation.');
  return new MobileApiError(503, 'member_invitation_unknown', 'The saved invitation could not be confirmed. Retry the exact saved invitation.');
}
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current invitation authority. The saved invitation is retained.'); }
  try { assertMemberInvitationScope(identity, context.request); } catch { throw failure('42501'); }
}
export async function applyMobileMemberInvitation(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileMemberInvitationRequestSchema.parse(context.request);
  try { assertMemberInvitationScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context);
  const query = (context.client as SupabaseClient<InvitationDatabase>).rpc('mobile_apply_member_invitation', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileMemberInvitationReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}

