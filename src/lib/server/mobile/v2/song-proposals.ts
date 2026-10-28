import 'server-only';
import { z } from 'zod';
import type { Json } from '@/lib/supabase/database.types';
import { mobileSongProposalRequestSchema, mobileSongProposalStatusSchema, mobileSongProposalReceiptSchema, assertSongProposalScope, assertMobileSongProposalReceipt, type MobileSongProposalRequest } from '@/lib/mobile/v2/song-proposals';
import { readMobileSongEditorContext, verifyMobileSongEditorAccess, type SongEditorContext } from './song-editor';
import { MobileApiError } from '../context';
function failure(code: string) {
 if (code === '42501') return new MobileApiError(403, 'song_proposal_access', 'Current matching selected-team song access is required. Keep the original proposal.');
 if (['22023', '22P02', '23514'].includes(code)) return new MobileApiError(409, 'song_proposal_intent', 'Retry the exact saved song proposal. A nonce may only submit its original changes, reason and revision.');
 return new MobileApiError(503, 'song_proposal_unconfirmed', 'Song proposal submission is unconfirmed. Keep its original changes, reason, revision and nonce.');
}
export async function submitMobileSongProposal(context: SongEditorContext & { request: MobileSongProposalRequest }) {
 const request = mobileSongProposalRequestSchema.parse(context.request), intent = request.intent;
 try { assertSongProposalScope(context.identity, intent); if (intent.proposal.targetId !== context.songId) throw new Error('Target mismatch'); } catch { throw failure('42501'); }
 await readMobileSongEditorContext(context);
 const proposed = intent.proposal;
 // Existing website RPC owns current membership, revision/status, actor+nonce
 // locking and notifications. It does not bind member/song creation timestamps.
 const query = context.client.rpc('submit_shared_edit_request', { p_target_type: 'song', p_target_id: context.songId, p_revision: proposed.revision, p_changes: proposed.changes as Json, p_reason: proposed.reason, p_request_nonce: proposed.requestNonce });
 const result = await (context.signal ? query.abortSignal(context.signal) : query); context.signal?.throwIfAborted(); if (result.error) throw failure(result.error.code);
 const id = z.uuid().safeParse(result.data); if (!id.success) throw failure('unverified');
 const lookup = context.client.from('shared_edit_requests').select('*').eq('id', id.data).eq('team_id', intent.teamId).eq('requested_by', intent.userId).eq('request_nonce', proposed.requestNonce);
 const receipt = await (context.signal ? lookup.abortSignal(context.signal) : lookup).maybeSingle(); context.signal?.throwIfAborted(); if (receipt.error || !receipt.data || receipt.data.id !== id.data) throw failure('unverified');
 await readMobileSongEditorContext(context);
 try { return assertMobileSongProposalReceipt(context.identity, context.songId, request, { version: 2, userId: intent.userId, teamId: intent.teamId, memberId: intent.memberId, request: receipt.data }); } catch { throw failure('unverified'); }
}
/** Own status lookup never submits, creates a record base or reads a replacement song. */
export async function readMobileSongProposalStatus(context: SongEditorContext & { requestNonce: string }) {
 const songId = z.uuid().parse(context.songId), requestNonce = z.uuid().parse(context.requestNonce);
 const before = await verifyMobileSongEditorAccess(context);
 const query = context.client.from('shared_edit_requests').select('*').eq('team_id', context.identity.teamId).eq('requested_by', context.identity.userId).eq('target_type', 'song').eq('target_id', songId).eq('request_nonce', requestNonce);
 const response = await (context.signal ? query.abortSignal(context.signal) : query).maybeSingle(); context.signal?.throwIfAborted(); if (response.error) throw failure(response.error.code);
 const after = await verifyMobileSongEditorAccess(context); if (before.fingerprint !== after.fingerprint) throw failure('42501');
 let receipt = null;
 if (response.data !== null) {
  const parsed = mobileSongProposalReceiptSchema.safeParse({ version: 2, userId: context.identity.userId, teamId: context.identity.teamId, memberId: context.identity.memberId, request: response.data });
  if (!parsed.success || parsed.data.request.team_id !== context.identity.teamId || parsed.data.request.requested_by !== context.identity.userId || parsed.data.request.target_id !== songId || parsed.data.request.request_nonce !== requestNonce) throw failure('unverified');
  receipt = parsed.data;
 }
 return mobileSongProposalStatusSchema.parse({ version: 2, identity: context.identity, songId, requestNonce, receipt, fetchedAt: new Date().toISOString() });
}
