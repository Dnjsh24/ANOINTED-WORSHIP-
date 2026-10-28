import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { mobileIdentitySchema, type MobileIdentity } from '@/lib/mobile/contracts';
import { assertDanceProposalReceipt, assertDanceProposalScope, mobileDanceProposalRequestSchema, mobileDanceProposalReceiptSchema,
  mobileDanceProposalSnapshotSchema, type MobileDanceProposalRequest } from '@/lib/mobile/v2/dance-proposals';
import { MobileApiError } from '../context';

type Context = { client: SupabaseClient<Database>; identity: MobileIdentity; chartId: string; signal?: AbortSignal };
function unavailable(status = 503) { return new MobileApiError(status, 'dance_proposal', status === 403 ? 'Current Dance access is required. Your saved proposal is retained.' : 'Dance proposal confirmation is unavailable. Retry the exact saved intent.'); }
function rpcError(code: string) { return unavailable(code === '42501' ? 403 : ['22023', '22P02', '23514'].includes(code) ? 409 : 503); }
async function chart(context: Context) {
  const identity = mobileIdentitySchema.parse(context.identity); z.uuid().parse(context.chartId); context.signal?.throwIfAborted();
  const query = context.client.from('dance_notes').select('id,team_id,shared_edit_revision,title,song_id,event_id,choreography_notes,formation_notes,outfit_notes,song_title,song_artist,song_version,video_url')
    .eq('team_id', identity.teamId).eq('id', context.chartId);
  const response = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle();
  context.signal?.throwIfAborted();
  if (response.error || !response.data) throw unavailable(response.error && response.error.code !== '42501' ? 503 : 403);
  const { id, team_id, shared_edit_revision, ...value } = response.data;
  // Dance has no physical sync_revision column. The existing generic mobile_record
  // uses shared_edit_target.revision for Dance; expose that current record revision
  // while keeping the proposal's actual shared_edit_revision explicit.
  const snapshot = mobileDanceProposalSnapshotSchema.safeParse({ version: 2, identity, chart: { id, teamId: team_id, syncRevision: shared_edit_revision, sharedEditRevision: shared_edit_revision, value }, fetchedAt: new Date().toISOString() });
  if (!snapshot.success || snapshot.data.chart.id !== context.chartId) throw unavailable();
  return snapshot.data;
}
export async function readMobileDanceProposalSnapshot(context: Context) { return chart(context); }
export async function submitMobileDanceProposal(context: Context & { request: MobileDanceProposalRequest }) {
  const request = mobileDanceProposalRequestSchema.parse(context.request); const intent = request.intent;
  try { assertDanceProposalScope(context.identity, intent); if (intent.proposal.targetId !== context.chartId) throw new Error('Target mismatch'); }
  catch { throw unavailable(403); }
  // Authenticated RLS preflight pins the target to the selected team. The RPC
  // rechecks current target access and owns nonce/revision/reviewer semantics.
  await chart(context);
  const proposed = intent.proposal;
  const query = context.client.rpc('submit_shared_edit_request', { p_target_type: 'choreography', p_target_id: proposed.targetId,
    p_revision: proposed.revision, p_changes: proposed.changes as Json, p_reason: proposed.reason, p_request_nonce: proposed.requestNonce });
  const response = await (context.signal ? query.abortSignal(context.signal) : query);
  context.signal?.throwIfAborted();
  if (response.error) throw rpcError(response.error.code);
  const id = z.uuid().safeParse(response.data); if (!id.success) throw unavailable();
  const lookup = context.client.from('shared_edit_requests').select('*').eq('id', id.data).eq('team_id', intent.teamId)
    .eq('requested_by', intent.userId).eq('request_nonce', proposed.requestNonce);
  const receipt = await (context.signal ? lookup.abortSignal(context.signal) : lookup).maybeSingle();
  context.signal?.throwIfAborted();
  if (receipt.error || !receipt.data) throw unavailable();
  const parsed = mobileDanceProposalReceiptSchema.safeParse({ version: 2, userId: intent.userId, teamId: intent.teamId, memberId: intent.memberId, request: receipt.data });
  if (!parsed.success) throw unavailable();
  try { assertDanceProposalReceipt(intent, parsed.data); } catch { throw unavailable(); }
  return parsed.data;
}
