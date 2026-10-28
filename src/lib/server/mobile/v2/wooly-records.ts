import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { assertMobileWoolyRecordsResponse, mobileWoolyRecordsRequestSchema, mobileWoolyRecordsReplySchema, type MobileWoolyRecordsRequest } from '@/lib/mobile/v2/wooly-records';
import { assertTeamNoticesIdentity } from '@/lib/mobile/v2/team-notices';
import { matchRecordQuestion, needsWoolyDate } from '@/lib/domain/wooly-chat';
import { readSelectedWorkspace } from '@/lib/mobile/v2/read-workspaces';
import { readWoolyRecords } from '@/lib/server/mobile/wooly-records-source';
import { MobileApiError } from '../context';
type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; request: MobileWoolyRecordsRequest; signal?: AbortSignal };
function bounded<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true });
    operation.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
async function verify(context: Context) {
  context.signal?.throwIfAborted(); const workspace = await bounded(readSelectedWorkspace({ client: context.client, userId: context.identity.userId, teamId: context.identity.teamId }), context.signal); context.signal?.throwIfAborted();
  try { assertTeamNoticesIdentity(context.identity, { userId: context.identity.userId, ...workspace }); }
  catch { throw new MobileApiError(403, 'wooly_records_scope', 'Verify your current account and team before reading live records.'); }
}
export async function readMobileWoolyRecords(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); const request = mobileWoolyRecordsRequestSchema.parse(context.request);
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId) throw new MobileApiError(403, 'wooly_records_scope', 'This question belongs to another selected membership.');
  const timeout = AbortSignal.timeout(20_000); const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
  context = { ...context, identity, request, signal }; await verify(context);
  const input = { question: request.question, today: request.today, pagePath: '/', ...(request.choice ? { choice: request.choice } : {}) };
  const record = matchRecordQuestion(input);
  const reply = needsWoolyDate(input) ? { kind: 'clarification' as const, text: 'Which date? Please use YYYY-MM-DD.', choices: [] }
    : record ? await readWoolyRecords(context.client, identity.teamId, record, { signal, requireCompleteSetlist: true })
      : { kind: 'unavailable' as const, text: 'This live lookup supports event dates, songs and setlists. Use offline help for feature guidance.' };
  signal.throwIfAborted(); await verify(context);
  try { return assertMobileWoolyRecordsResponse(identity, request, { version: 2, identity, request, reply: mobileWoolyRecordsReplySchema.parse(reply), fetchedAt: new Date().toISOString() }); }
  catch { throw new MobileApiError(503, 'wooly_records_unverified', 'Live records could not be verified. Open the page directly or retry when connected.'); }
}
