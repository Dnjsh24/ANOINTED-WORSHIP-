import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertTeamSettingsEditScope, assertMobileTeamSettingsEditReceipt, mobileTeamSettingsEditRequestSchema, type MobileTeamSettingsEditRequest } from '@/lib/mobile/v2/team-settings-edit';
import { MobileApiError } from '../context';
type SettingsEditDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_team_settings_edit: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; request: MobileTeamSettingsEditRequest; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'team_settings_edit_access', 'Current team-management authority is required. The saved defaults edit is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'team_settings_edit_validation', 'Review the saved defaults edit. Its nonce may only retry the original base and defaults.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'team_settings_edit_retry', 'A concurrent settings change is in progress. Retry the exact saved defaults edit.');
  return new MobileApiError(503, 'team_settings_edit_unknown', 'The saved defaults edit could not be confirmed. Retry the exact saved defaults edit.');
}
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current team-management authority. The saved defaults edit is retained.'); }
  try { assertTeamSettingsEditScope(identity, context.request); } catch { throw failure('42501'); }
}
export async function applyMobileTeamSettingsEdit(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileTeamSettingsEditRequestSchema.parse(context.request);
  try { assertTeamSettingsEditScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context);
  const query = (context.client as SupabaseClient<SettingsEditDatabase>).rpc('mobile_apply_team_settings_edit', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileTeamSettingsEditReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}


