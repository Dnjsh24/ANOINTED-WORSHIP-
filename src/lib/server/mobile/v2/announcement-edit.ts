import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertAnnouncementEditScope, assertMobileAnnouncementEditReceipt, mobileAnnouncementEditRequestSchema, type MobileAnnouncementEditRequest } from '@/lib/mobile/v2/announcement-edit';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { MobileApiError } from '../context';

type AnnouncementDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_announcement_edit: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; request: MobileAnnouncementEditRequest; signal?: AbortSignal };
function failure(code: string) {
  if (code === '42501') return new MobileApiError(403, 'announcement_access', 'Current owner/admin announcement management access is required. Your saved intent is retained.');
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'announcement_validation', 'Review the saved announcement and current target. A nonce may only retry its original intent.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'announcement_retry', 'Another announcement change is in progress. Retry the exact saved intent.');
  return new MobileApiError(503, 'announcement_unknown', 'The announcement change could not be confirmed. Retry the exact saved intent.');
}
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); }
  catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current announcement authority. Your saved intent is retained.'); }
  try { assertAnnouncementEditScope(identity, context.request); } catch { throw failure('42501'); }
}
export async function applyMobileAnnouncementEdit(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileAnnouncementEditRequestSchema.parse(context.request);
  try { assertAnnouncementEditScope(identity, request); } catch { throw failure('42501'); }
  context = { ...context, identity, request }; await verify(context);
  const query = (context.client as SupabaseClient<AnnouncementDatabase>).rpc('mobile_apply_announcement_edit', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileAnnouncementEditReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}
