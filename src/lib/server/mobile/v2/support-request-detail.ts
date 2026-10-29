import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileSupportRequestSchema } from '@/lib/mobile/v2/support-requests';
import { assertMobileSupportRequestDetail, mobileSupportMessageSchema } from '@/lib/mobile/v2/support-request-detail';
import { MobileApiError } from '../context';
const joinedMessageSchema = mobileSupportMessageSchema.extend({ parent: z.object({ profile_id: z.uuid() }).strict() }).strict();
const unavailable = () => new MobileApiError(503, 'support_thread_unavailable', 'Your support thread could not be verified. Try again when connected.');
export async function readMobileSupportRequestDetail(context: { client: SupabaseClient<Database>; userId: string; requestId: string; offset: number; signal?: AbortSignal }) {
  const userId = z.uuid().parse(context.userId); const requestId = z.uuid().parse(context.requestId); const offset = z.number().int().min(0).max(1_000_000).parse(context.offset);
  context.signal?.throwIfAborted();
  const parentQuery = context.client.from('wooly_support_requests').select('id,profile_id,team_id,question,details,page_path,status,created_at,updated_at,requester_read_at,support_updated_at')
    .eq('id', requestId).eq('profile_id', userId);
  const parentResult = await (context.signal ? parentQuery.abortSignal(context.signal) : parentQuery).maybeSingle(); context.signal?.throwIfAborted();
  if (parentResult.error) throw unavailable();
  try {
    if (parentResult.data === null) return assertMobileSupportRequestDetail(userId, requestId, offset, { version: 2, userId, requestId, request: null, messages: [], offset, hasMore: false, fetchedAt: new Date().toISOString() });
    const request = mobileSupportRequestSchema.parse(parentResult.data);
    if (request.profile_id !== userId || request.id !== requestId) throw unavailable();
    // RLS permits staff to read other accounts. This endpoint never does: keep
    // the parent ownership predicate on the message query as well as the lookup.
    const messageQuery = context.client.from('wooly_support_messages').select('id,request_id,author_id,author_kind,body,created_at,parent:wooly_support_requests!inner(profile_id)')
      .eq('request_id', requestId).eq('parent.profile_id', userId).order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 200);
    const messageResult = await (context.signal ? messageQuery.abortSignal(context.signal) : messageQuery); context.signal?.throwIfAborted();
    if (messageResult.error) throw unavailable();
    const rows = z.array(joinedMessageSchema).max(201).parse(messageResult.data);
    if (rows.some(row => row.parent.profile_id !== userId)) throw unavailable();
    const messages = rows.slice(0, 200).map(({ parent, ...message }) => { void parent; return message; });
    return assertMobileSupportRequestDetail(userId, requestId, offset, { version: 2, userId, requestId, request, messages, offset, hasMore: rows.length > 200, fetchedAt: new Date().toISOString() });
  } catch (error) { context.signal?.throwIfAborted(); if (error instanceof MobileApiError) throw error; throw unavailable(); }
}
