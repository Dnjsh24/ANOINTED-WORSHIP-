import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertProfileEditScope, assertMobileProfileEditReceipt, mobileProfileEditRequestSchema, type MobileProfileEditRequest } from '@/lib/mobile/v2/profile-edit';
import { MobileApiError } from '../context';

type ProfileEditDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_profile_edit: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; request: MobileProfileEditRequest; signal?: AbortSignal };
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const workspace = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const permissions = (actor: { permissions: readonly string[] }) => [...new Set(actor.permissions)].sort().join(',');
  if (workspace.memberId !== context.identity.memberId || workspace.teamId !== context.identity.teamId || workspace.role !== context.identity.role || permissions(workspace) !== permissions(context.identity)) {
    throw new MobileApiError(409, 'scope_changed', 'Reopen the matching account and current profile membership. Your saved edit is retained.');
  }
}
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'profile_access', 'Current access to your own selected membership is required. Your saved edit is retained.');
  if (['22023', '22P02', '22007', '22008', '23514'].includes(code)) return new MobileApiError(400, 'profile_validation', 'Review the saved profile edit. A nonce may only retry its original fields.');
  if (['40001', '40P01'].includes(code)) return new MobileApiError(409, 'profile_retry', 'Another profile change is in progress. Retry the exact saved request.');
  return new MobileApiError(503, 'profile_edit_unknown', 'The profile edit could not be confirmed. Retry the exact saved request.');
}
export async function applyMobileProfileEdit(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileProfileEditRequestSchema.parse(context.request);
  try { assertProfileEditScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context);
  const query = (context.client as SupabaseClient<ProfileEditDatabase>).rpc('mobile_apply_profile_edit', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileProfileEditReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}
