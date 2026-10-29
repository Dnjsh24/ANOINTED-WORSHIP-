// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { MobileApiError } from '../context';
import { songEditorContext as editor, songProposalIntent as intent, songProposalReceipt as receipt, songEditorId as id } from '@/lib/mobile/v2/song-editor-test-fixture';
import { mobileSongProposalRequestSchema, assertMobileSongProposalStatus } from '@/lib/mobile/v2/song-proposals';
const mocks = vi.hoisted(() => ({ editor: vi.fn(), access: vi.fn() }));
vi.mock('server-only', () => ({})); vi.mock('./song-editor', () => ({ readMobileSongEditorContext: mocks.editor, verifyMobileSongEditorAccess: mocks.access }));
import { submitMobileSongProposal, readMobileSongProposalStatus } from './song-proposals';
const request = { version: 2 as const, intent };
function setup(row: unknown = receipt.request, code?: string) {
 const calls: unknown[] = []; const query = { select: vi.fn(() => query), eq: vi.fn((...args: unknown[]) => { calls.push(args); return query; }), abortSignal: vi.fn(() => query), maybeSingle: async () => ({ data: row, error: null }) };
 const rpc = vi.fn(async () => ({ data: receipt.request.id, error: code ? { code } : null }));
 return { context: { client: { from: vi.fn(() => query), rpc } as unknown as SupabaseClient<Database>, identity: editor.identity, songId: editor.song.id }, rpc, calls };
}
beforeEach(() => { mocks.editor.mockReset(); mocks.access.mockReset(); mocks.editor.mockResolvedValue(editor); mocks.access.mockResolvedValue({ fingerprint: 'same' }); });
it('submits only allowed song fields, original reason/revision/nonce and verifies the own request receipt', async () => {
 const { context, rpc, calls } = setup(); expect(await submitMobileSongProposal({ ...context, request })).toEqual(receipt);
 expect(rpc).toHaveBeenCalledWith('submit_shared_edit_request', { p_target_type: 'song', p_target_id: intent.proposal.targetId, p_revision: intent.proposal.revision, p_changes: intent.proposal.changes, p_reason: intent.proposal.reason, p_request_nonce: intent.proposal.requestNonce });
 expect(calls).toContainEqual(['requested_by', intent.userId]); expect(mocks.editor).toHaveBeenCalledTimes(2);
 for (const changes of [{ created_by: id(8) }, { status: 'approved' }, { deleted_at: null }]) expect(mobileSongProposalRequestSchema.safeParse({ version: 2, intent: { ...intent, proposal: { ...intent.proposal, changes } } }).success).toBe(false);
 expect(mobileSongProposalRequestSchema.safeParse({ version: 2, intent: { ...intent, proposal: { ...intent.proposal, reason: ' ' } } }).success).toBe(false);
});
it('recovers own status by nonce without submitting or reading current/replacement song', async () => {
 const { context, rpc, calls } = setup(); const result = await readMobileSongProposalStatus({ ...context, requestNonce: intent.proposal.requestNonce });
 expect(assertMobileSongProposalStatus(editor.identity, editor.song.id, request, result).receipt).toEqual(receipt); expect(rpc).not.toHaveBeenCalled(); expect(mocks.editor).not.toHaveBeenCalled();
 expect(calls).toContainEqual(['target_type', 'song']); expect(calls).toContainEqual(['target_id', editor.song.id]);
 expect((await readMobileSongProposalStatus({ ...setup(null).context, requestNonce: intent.proposal.requestNonce })).receipt).toBeNull();
 expect(() => assertMobileSongProposalStatus(editor.identity, editor.song.id, { version: 2, intent: { ...intent, proposal: { ...intent.proposal, changes: { title: 'Other title' } } } }, result)).toThrow();
});
it('returns actual request statuses at lookup without treating them as publication success', async () => {
 for (const status of ['pending', 'needs_revision', 'approved', 'rejected', 'withdrawn']) { const { context } = setup({ ...receipt.request, status }); expect((await submitMobileSongProposal({ ...context, request })).request.status).toBe(status); }
 await expect(submitMobileSongProposal({ ...setup({ ...receipt.request, status: 'applied' }).context, request })).rejects.toMatchObject({ status: 503 });
});
it('keeps a lost post-submit confirmation recoverable through read-only own status', async () => {
 mocks.editor.mockResolvedValueOnce(editor).mockRejectedValueOnce(new MobileApiError(403, 'scope_changed', 'Authority changed after commit.'));
 const db = setup(); await expect(submitMobileSongProposal({ ...db.context, request })).rejects.toMatchObject({ status: 403 });
 expect(db.rpc).toHaveBeenCalledTimes(1);
 const recovered = await readMobileSongProposalStatus({ ...db.context, requestNonce: intent.proposal.requestNonce });
 expect(assertMobileSongProposalStatus(editor.identity, editor.song.id, request, recovered).receipt).toEqual(receipt);
 expect(db.rpc).toHaveBeenCalledTimes(1);
});
it('rejects foreign intent before RPC, wrong receipts, revoked pre/post access and unknown outcomes', async () => {
 const db = setup(); await expect(submitMobileSongProposal({ ...db.context, request: { version: 2, intent: { ...intent, memberId: id(99) } } })).rejects.toMatchObject({ status: 403 }); expect(db.rpc).not.toHaveBeenCalled();
 for (const row of [{ ...receipt.request, requested_by: id(99) }, { ...receipt.request, id: id(99) }, { ...receipt.request, changes: { title: 'Other' } }]) await expect(submitMobileSongProposal({ ...setup(row).context, request })).rejects.toMatchObject({ status: 503 });
 for (const [code, status] of [['42501', 403], ['22023', 409], ['XX000', 503]] as const) await expect(submitMobileSongProposal({ ...setup(receipt.request, code).context, request })).rejects.toMatchObject({ status });
 mocks.editor.mockRejectedValueOnce(new Error('Revoked')); const revoked = setup(); await expect(submitMobileSongProposal({ ...revoked.context, request })).rejects.toThrow(); expect(revoked.rpc).not.toHaveBeenCalled();
 mocks.access.mockResolvedValueOnce({ fingerprint: 'old' }).mockResolvedValueOnce({ fingerprint: 'new' }); await expect(readMobileSongProposalStatus({ ...setup().context, requestNonce: intent.proposal.requestNonce })).rejects.toMatchObject({ status: 403 });
});
