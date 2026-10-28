import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database, Json } from '@/lib/supabase/database.types';
import { assertMobileTemplateCommandScope, mobileTemplateCommandsRequestSchema } from '@/lib/mobile/v2/template-commands';
import { assertMobileTemplateResult, mobileTemplateCommandsResponseSchema, mobileTemplateResultSchema } from '@/lib/mobile/v2/template-results';
import { mobileWorkflowIdentitySchema } from '@/lib/mobile/v2/workflow-commands';
import { MobileApiError } from '../context';

type TemplateDatabase = Omit<Database, 'public'> & { public: Database['public'] & { Functions: Database['public']['Functions'] & {
  mobile_apply_template_commands: { Args: { p_team_id: string; p_member_id: string; p_commands: Json }; Returns: Json };
} } };
export async function applyMobileTemplateCommands(input: { client: SupabaseClient<Database>; identity: z.infer<typeof mobileWorkflowIdentitySchema>; request: z.infer<typeof mobileTemplateCommandsRequestSchema> }) {
  const request = mobileTemplateCommandsRequestSchema.parse(input.request);
  const identity = mobileWorkflowIdentitySchema.parse({ userId: input.identity.userId, teamId: input.identity.teamId, memberId: input.identity.memberId });
  try { request.commands.forEach(command => assertMobileTemplateCommandScope(command, identity.teamId)); }
  catch { throw new MobileApiError(400, 'validation', 'This template base belongs to another workspace. Keep its original draft.'); }
  const response = await (input.client as SupabaseClient<TemplateDatabase>).rpc('mobile_apply_template_commands', {
    p_team_id: identity.teamId, p_member_id: identity.memberId, p_commands: request.commands as Json,
  });
  if (response.error) {
    const code = response.error.code;
    if (['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)) throw new MobileApiError(code === '42501' ? 403 : 401, 'permission', 'Reopen the matching account and team. Saved work is retained.');
    if (['40001', '40P01'].includes(code)) throw new MobileApiError(409, 'retry', 'Another change is in progress. Retry the same command IDs.');
    if (['22023', '22P02', '23514', '22003', '22007', '22008'].includes(code)) throw new MobileApiError(400, 'validation', 'Review this template change. Saved work is retained.');
    throw new MobileApiError(503, 'unavailable', 'Template synchronization is unavailable. Saved work is retained.');
  }
  const parsed = z.array(mobileTemplateResultSchema).length(request.commands.length).safeParse(response.data);
  const unverified = () => new MobileApiError(503, 'unavailable', 'Template confirmation could not be verified. Retry the same command IDs.');
  if (!parsed.success) throw unverified();
  try { parsed.data.forEach((result, index) => assertMobileTemplateResult(request.commands[index], identity, result)); }
  catch { throw unverified(); }
  return mobileTemplateCommandsResponseSchema.parse({ version: 2, identity, results: parsed.data });
}
