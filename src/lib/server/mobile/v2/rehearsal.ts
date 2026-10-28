import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import type { MobileIdentity } from '@/lib/mobile/contracts';
import { mobileIdentitySchema } from '@/lib/mobile/contracts';
import { mobileRehearsalCacheSchema, mobileRehearsalWorkspaceSchema } from '@/lib/mobile/v2/rehearsal-state';
import { assertMobileRehearsalResult, assertRehearsalCommandScope, mobileRehearsalCommandsRequestSchema, mobileRehearsalCommandsResponseSchema, mobileRehearsalResultSchema,
  type MobileRehearsalCommandsResponse } from '@/lib/mobile/v2/rehearsal-commands';
import { MobileApiError } from '../context';

type RehearsalDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_read_rehearsal_workspace: { Args: { p_team_id: string; p_member_id: string; p_setlist_id: string }; Returns: Json };
  mobile_apply_rehearsal_commands: { Args: { p_team_id: string; p_member_id: string; p_commands: Json }; Returns: Json };
} } };
function rehearsalError(code: string) {
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) return new MobileApiError(code === '42501' ? 403 : 401, 'permission', 'Reopen the matching account and team. Saved rehearsal work is retained.');
  if (['40001', '40P01'].includes(code)) return new MobileApiError(409, 'retry', 'Another rehearsal change is in progress. Retry the same command IDs.');
  if (['22023', '22P02', '23514', '22003'].includes(code)) return new MobileApiError(400, 'validation', 'Review this rehearsal change. Saved work is retained.');
  return new MobileApiError(503, 'unavailable', 'Rehearsal services are unavailable. Saved work is retained.');
}
export async function readMobileRehearsalWorkspace(input: { client: SupabaseClient<Database>; identity: MobileIdentity; setlistId: string; signal?: AbortSignal }) {
  const identity = mobileIdentitySchema.parse(input.identity);
  const setlistId = z.uuid().parse(input.setlistId);
  input.signal?.throwIfAborted();
  const query = (input.client as SupabaseClient<RehearsalDatabase>).rpc('mobile_read_rehearsal_workspace', { p_team_id: identity.teamId, p_member_id: identity.memberId, p_setlist_id: setlistId });
  const response = await (input.signal ? query.abortSignal(input.signal) : query);
  input.signal?.throwIfAborted();
  if (response.error) throw rehearsalError(response.error.code);
  const workspace = mobileRehearsalWorkspaceSchema.safeParse(response.data);
  if (!workspace.success || workspace.data.setlistId !== setlistId || workspace.data.teamId !== identity.teamId) throw rehearsalError('unverified');
  return mobileRehearsalCacheSchema.parse({ version: 2, identity, workspace: workspace.data });
}
export async function applyMobileRehearsalCommands(input: { client: SupabaseClient<Database>; identity: MobileIdentity;
  request: z.infer<typeof mobileRehearsalCommandsRequestSchema> }): Promise<MobileRehearsalCommandsResponse> {
  const identity = mobileIdentitySchema.parse(input.identity);
  const request = mobileRehearsalCommandsRequestSchema.parse(input.request);
  try { request.commands.forEach(command => assertRehearsalCommandScope(command, identity)); }
  catch { throw rehearsalError('22023'); }
  const response = await (input.client as SupabaseClient<RehearsalDatabase>).rpc('mobile_apply_rehearsal_commands', {
    p_team_id: identity.teamId, p_member_id: identity.memberId, p_commands: request.commands as Json,
  });
  if (response.error) throw rehearsalError(response.error.code);
  const parsed = z.array(mobileRehearsalResultSchema).length(request.commands.length).safeParse(response.data);
  if (!parsed.success) throw rehearsalError('unverified');
  try { parsed.data.forEach((result, index) => assertMobileRehearsalResult(request.commands[index], identity, result)); }
  catch { throw rehearsalError('unverified'); }
  return mobileRehearsalCommandsResponseSchema.parse({ version: 2, identity: { userId: identity.userId, teamId: identity.teamId, memberId: identity.memberId }, results: parsed.data });
}
