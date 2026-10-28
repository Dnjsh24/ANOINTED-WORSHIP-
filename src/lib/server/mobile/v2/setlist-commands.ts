import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, Json } from '@/lib/supabase/database.types';
import { assertMobileSetlistCommandScope, mobileSetlistCommandsRequestSchema } from '@/lib/mobile/v2/setlist-commands';
import { assertMobileSetlistResult, mobileSetlistCommandsResponseSchema, mobileSetlistDeleteReviewSchema, mobileSetlistDeleteReviewResponseSchema, mobileSetlistResultSchema } from '@/lib/mobile/v2/setlist-results';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { MobileApiError } from '../context';

type SetlistCommandDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_setlist_commands: { Args: { p_team_id: string; p_member_id: string; p_commands: Json }; Returns: Json };
  mobile_read_setlist_delete_scope: { Args: { p_team_id: string; p_member_id: string; p_setlist_id: string }; Returns: Json };
} } };
type Identity = z.infer<typeof mobileWorkflowIdentitySchema>;
function verifiedIdentity(input: Identity) { return mobileWorkflowIdentitySchema.parse({ userId: input.userId, teamId: input.teamId, memberId: input.memberId }); }
function throwDatabaseError(code: string): never {
  if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) throw new MobileApiError(code === '42501' ? 403 : 401, 'permission', 'Reopen the matching account and team. Saved work is retained.');
  if (['40001', '40P01'].includes(code)) throw new MobileApiError(409, 'retry', 'Another change is in progress. Retry with the same command IDs.');
  if (['22023', '22P02', '22007', '22008', '23514', '22003'].includes(code)) throw new MobileApiError(400, 'validation', 'Review this setlist change. Saved work is retained.');
  throw new MobileApiError(503, 'unavailable', 'Setlist synchronization is unavailable. Saved work is retained.');
}
export async function applyMobileSetlistCommands(input: { client: SupabaseClient<Database>; identity: Identity; request: z.infer<typeof mobileSetlistCommandsRequestSchema> }) {
  const request = mobileSetlistCommandsRequestSchema.parse(input.request); const identity = verifiedIdentity(input.identity);
  try { request.commands.forEach(command => assertMobileSetlistCommandScope(command, identity.teamId)); }
  catch { throw new MobileApiError(400, 'validation', 'This setlist base belongs to another workspace. Keep its original draft.'); }
  const response = await (input.client as SupabaseClient<SetlistCommandDatabase>).rpc('mobile_apply_setlist_commands', {
    p_team_id: identity.teamId, p_member_id: identity.memberId, p_commands: request.commands as Json,
  });
  if (response.error) throwDatabaseError(response.error.code);
  const parsed = z.array(mobileSetlistResultSchema).length(request.commands.length).safeParse(response.data);
  const unverified = () => new MobileApiError(503, 'unavailable', 'Setlist confirmation could not be verified. Retry with the same command IDs.');
  if (!parsed.success) throw unverified();
  try { parsed.data.forEach((result, index) => assertMobileSetlistResult(request.commands[index], identity, result)); }
  catch { throw unverified(); }
  return mobileSetlistCommandsResponseSchema.parse({ version: 2, identity, results: parsed.data });
}

/** Includes tombstoned siblings that the active editor cache cannot enumerate. Reading never approves a deletion. */
export async function readMobileSetlistDeleteScope(input: { client: SupabaseClient<Database>; identity: Identity; setlistId: string }) {
  const identity = verifiedIdentity(input.identity); const setlistId = z.uuid().parse(input.setlistId);
  const response = await (input.client as SupabaseClient<SetlistCommandDatabase>).rpc('mobile_read_setlist_delete_scope', {
    p_team_id: identity.teamId, p_member_id: identity.memberId, p_setlist_id: setlistId,
  });
  if (response.error) throwDatabaseError(response.error.code);
  const parsed = mobileSetlistDeleteReviewSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.snapshot.record.id !== setlistId || parsed.data.snapshot.record.team_id !== identity.teamId) {
    throw new MobileApiError(503, 'unavailable', 'The complete deletion scope could not be verified. Keep the setlist and its draft.');
  }
  return mobileSetlistDeleteReviewResponseSchema.parse({ version: 2, identity, review: parsed.data });
}
