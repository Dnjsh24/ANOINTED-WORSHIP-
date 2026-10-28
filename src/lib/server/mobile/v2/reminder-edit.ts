import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { assertReminderEditScope, assertMobileReminderEditReceipt, assertMobileReminderManagementPage, mobileReminderEditRequestSchema,
  mobileReminderManagementRequestSchema, mobileReminderManagementPageSchema, type MobileReminderEditRequest, type MobileReminderManagementRequest } from '@/lib/mobile/v2/reminder-edit';
import { MobileApiError } from '../context';

type ReminderDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_reminder_edit: { Args: { p_team_id: string; p_member_id: string; p_request: Json }; Returns: Json };
  mobile_read_reminder_management: { Args: { p_team_id: string; p_member_id: string; p_input: Json }; Returns: Json };
} } };
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; signal?: AbortSignal };
function denied() { return new MobileApiError(403, 'reminder_access', 'Current owner/admin member-management access is required. Saved reminder work is retained.'); }
async function verify(context: Context) {
  context.signal?.throwIfAborted();
  const current = await readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }); context.signal?.throwIfAborted();
  const identity = { userId: context.identity.userId, ...current };
  try { assertTeamNoticesIdentity(context.identity, identity); } catch { throw new MobileApiError(409, 'scope_changed', 'Reopen the matching team and current reminder authority. Saved work is retained.'); }
  try { assertReminderEditScope(identity); } catch { throw denied(); }
}
function failure(code: string) {
  if (code === '42501') return denied();
  if (['22023', '22P02', '22007', '22008', '23514', '23503'].includes(code)) return new MobileApiError(400, 'reminder_validation', 'Review the reminder schedule, audience and saved intent. A nonce may only retry its original request.');
  if (['40001', '40P01', '23505'].includes(code)) return new MobileApiError(409, 'reminder_retry', 'Another reminder change is in progress. Retry the exact saved intent.');
  return new MobileApiError(503, 'reminder_unknown', 'The reminder change could not be confirmed. Retry the exact saved intent.');
}
export async function applyMobileReminderEdit(context: Context & { request: MobileReminderEditRequest }) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileReminderEditRequestSchema.parse(context.request);
  try { assertReminderEditScope(identity, request); } catch { throw denied(); }
  context = { ...context, identity, request }; await verify(context);
  const query = (context.client as SupabaseClient<ReminderDatabase>).rpc('mobile_apply_reminder_edit', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_request: request as unknown as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error) throw failure(response.error.code);
  await verify(context);
  try { return assertMobileReminderEditReceipt(identity, request, response.data); } catch { throw failure('unverified'); }
}
export async function readMobileReminderManagement(context: Context & { input: MobileReminderManagementRequest }) {
  const identity = mobileIdentitySchema.parse(context.identity); const input = mobileReminderManagementRequestSchema.parse(context.input);
  try { assertReminderEditScope(identity); } catch { throw denied(); }
  context = { ...context, identity, input }; await verify(context);
  if (input.asOf && Date.parse(input.asOf) > Date.now()) throw new MobileApiError(400, 'reminder_cursor', 'The management cutoff cannot be in the future.');
  const query = (context.client as SupabaseClient<ReminderDatabase>).rpc('mobile_read_reminder_management', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_input: input as Json });
  const response = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
  if (response.error?.code === '42501') throw denied();
  const body = mobileReminderManagementPageSchema.omit({ version: true, identity: true }).safeParse(response.data);
  if (response.error || !body.success) throw new MobileApiError(503, 'reminder_management', 'The complete reminder management page could not be verified. Previous saved data is retained.');
  await verify(context);
  try { return assertMobileReminderManagementPage(identity, input, { version: 2, identity, ...body.data }); }
  catch { throw new MobileApiError(503, 'reminder_management', 'Reminder management changed ordering or completeness. Previous saved data is retained.'); }
}
