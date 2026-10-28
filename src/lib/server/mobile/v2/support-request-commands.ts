import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { assertMobileSupportRequestConfirmation, mobileSupportRequestCommandSchema, type MobileSupportRequestCommand } from '@/lib/mobile/v2/support-request-commands';
import { mobileSupportRequestSchema } from '@/lib/mobile/v2/support-requests';
import { mobileSupportMessageSchema } from '@/lib/mobile/v2/support-request-detail';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { MobileApiError } from '../context';
type Context = { client: SupabaseClient<Database>; userId: string; intent: MobileSupportRequestCommand; selectedTeamId: string | null; signal?: AbortSignal };
const unknown = () => new MobileApiError(503, 'support_command_unconfirmed', 'Support could not confirm this saved request. Keep it and retry the exact original intent.');
const conflict = () => new MobileApiError(409, 'support_command_conflict', 'This ID already belongs to different support content. Keep the original intent.');
const denied = () => new MobileApiError(403, 'support_command_access', 'Your own support request or current selected team could not be verified. Keep the saved intent.');
const parentFields = 'id,profile_id,team_id,question,details,page_path,status,created_at,updated_at,requester_read_at,support_updated_at';
async function parent(context: Context) {
  const query = context.client.from('wooly_support_requests').select(parentFields).eq('id', context.intent.requestId).eq('profile_id', context.userId);
  const result = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle(); context.signal?.throwIfAborted();
  if (result.error) throw unknown(); if (result.data === null) return null;
  const row = mobileSupportRequestSchema.safeParse(result.data); if (!row.success || row.data.profile_id !== context.userId || row.data.id !== context.intent.requestId) throw denied(); return row.data;
}
async function existing(context: Context): Promise<{ id: string; createdAt: string } | null> {
  const request = await parent(context); const intent = context.intent;
  if (intent.kind === 'create') {
    if (!request) return null;
    if (request.team_id !== intent.teamId || request.question !== intent.question || request.details !== intent.details || request.page_path !== intent.pagePath) throw conflict();
    return { id: request.id, createdAt: request.created_at };
  }
  if (!request) throw denied();
  const query = context.client.from('wooly_support_messages').select('id,request_id,author_id,author_kind,body,created_at,parent:wooly_support_requests!inner(profile_id)')
    .eq('id', intent.messageId).eq('request_id', intent.requestId).eq('author_id', context.userId).eq('parent.profile_id', context.userId);
  const result = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle(); context.signal?.throwIfAborted();
  if (result.error) throw unknown(); if (result.data === null) return null;
  const row = mobileSupportMessageSchema.extend({ parent: z.object({ profile_id: z.uuid() }).strict() }).strict().safeParse(result.data);
  if (!row.success || row.data.parent.profile_id !== context.userId || row.data.author_id !== context.userId || row.data.request_id !== intent.requestId || row.data.id !== intent.messageId) throw denied();
  if (row.data.author_kind !== 'requester' || row.data.body !== intent.body) throw conflict();
  return { id: row.data.id, createdAt: row.data.created_at };
}
export async function applyMobileSupportRequestCommand(context: Context) {
  const intent = mobileSupportRequestCommandSchema.parse(context.intent); const userId = z.uuid().parse(context.userId);
  if (intent.userId !== userId) throw denied(); context = { ...context, intent, userId }; context.signal?.throwIfAborted();
  let record = await existing(context);
  if (!record) {
    if (intent.kind === 'create' && intent.teamId !== null) {
      if (context.selectedTeamId !== intent.teamId) throw denied();
      const workspace = await readSelectedWorkspace({ client: context.client, userId, teamId: intent.teamId });
      if (workspace.teamId !== intent.teamId) throw denied();
    }
    context.signal?.throwIfAborted();
    const query = intent.kind === 'create' ? context.client.rpc('create_wooly_support_request', { p_id: intent.requestId, p_question: intent.question, p_details: intent.details, p_page_path: intent.pagePath, p_team_id: intent.teamId })
      : context.client.rpc('reply_wooly_support', { p_request_id: intent.requestId, p_id: intent.messageId, p_body: intent.body, p_as_support: false });
    const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted();
    // Generic legacy exceptions expose no safe semantic code. Re-read exact own
    // rows after any reply; a committed/lost response can still be confirmed.
    record = await existing(context);
    if (!record || result.data && result.data !== record.id) throw unknown();
  }
  return assertMobileSupportRequestConfirmation(userId, intent, { version: 2, intent, status: 'confirmed', record });
}
