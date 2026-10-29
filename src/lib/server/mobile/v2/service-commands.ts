import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileServiceCommandsRequestSchema } from '@/lib/mobile/v2/service-commands';
import { assertMobileServiceResult, mobileServiceCommandsResponseSchema, mobileServiceResultSchema } from '@/lib/mobile/v2/service-results';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { MobileApiError } from '../context';

type ServiceCommandDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_service_commands: { Args: { p_team_id: string; p_member_id: string; p_commands: Json }; Returns: Json };
} } };
export async function applyMobileServiceCommands(input: { client: SupabaseClient<Database>; identity: { userId: string; teamId: string; memberId: string };
  request: z.infer<typeof mobileServiceCommandsRequestSchema> }) {
  const request = mobileServiceCommandsRequestSchema.parse(input.request);
  const identity = mobileWorkflowIdentitySchema.parse({ userId: input.identity.userId, teamId: input.identity.teamId, memberId: input.identity.memberId });
  if (request.commands.some(command => command.type === 'service.assignment.respond' ? command.baseAssignment.memberId !== identity.memberId
    : command.baseOrder !== null && command.baseOrder.team_id !== identity.teamId)) throw new MobileApiError(400, 'validation', 'This service base belongs to another workspace or membership.');
  const result = await (input.client as SupabaseClient<ServiceCommandDatabase>).rpc('mobile_apply_service_commands', {
    p_team_id: identity.teamId, p_member_id: identity.memberId, p_commands: request.commands as Json,
  });
  if (result.error) {
    const code = result.error.code;
    if (['42501','PGRST301','PGRST302','PGRST303'].includes(code)) throw new MobileApiError(code === '42501' ? 403 : 401, 'permission', 'Reopen the matching account and workspace. Your draft is safe.');
    if (['40001','40P01'].includes(code)) throw new MobileApiError(409, 'retry', 'Another change is in progress. Retry with the same command IDs.');
    if (['22023','22P02','22007','22008','23514'].includes(code)) throw new MobileApiError(400, 'validation', 'Review these commands. Your draft is safe.');
    throw new MobileApiError(503, 'unavailable', 'Service synchronization is unavailable. Your draft is safe.');
  }
  const parsed = z.array(mobileServiceResultSchema).length(request.commands.length).safeParse(result.data);
  if (!parsed.success) throw new MobileApiError(503, 'unavailable', 'Service confirmation could not be verified. Retry with the same command IDs.');
  try { parsed.data.forEach((response, index) => assertMobileServiceResult(request.commands[index], identity, response)); }
  catch { throw new MobileApiError(503, 'unavailable', 'Service confirmation could not be verified. Retry with the same command IDs.'); }
  return mobileServiceCommandsResponseSchema.parse({ version: 2, identity, results: parsed.data });
}
