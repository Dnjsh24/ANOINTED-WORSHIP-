// @vitest-environment node
import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { danceProposalSnapshot as snapshot, danceProposalIntent as intent, danceProposalReceipt as receipt, danceProposalId as id } from '@/lib/mobile/v2/dance-proposal-test-fixture';
vi.mock('server-only', () => ({}));
import { readMobileDanceProposalSnapshot, submitMobileDanceProposal } from './dance-proposals';
const row = { id: id(4), team_id: id(2), shared_edit_revision: 3, ...snapshot.chart.value };
function setup(chart: unknown = row, request: unknown = receipt.request, code?: string) {
  const calls: unknown[] = [];
  const from = vi.fn((table: string) => { const query = { select: vi.fn(() => query), eq: vi.fn((...args: unknown[]) => { calls.push([table, ...args]); return query; }),
    maybeSingle: () => Promise.resolve({ data: table === 'dance_notes' ? chart : request, error: null }) }; return query; });
  const rpc = vi.fn(async () => ({ data: receipt.request.id, error: code ? { code } : null }));
  return { calls, rpc, context: { client: { from, rpc } as unknown as SupabaseClient<Database>, identity: snapshot.identity, chartId: id(4) } };
}
it('reads the real Dance shared revision and existing generic record revision from a selected-team chart', async () => {
  const { context, calls } = setup(); expect((await readMobileDanceProposalSnapshot(context)).chart).toEqual({ ...snapshot.chart, syncRevision: 3 });
  expect(calls).toEqual(expect.arrayContaining([['dance_notes', 'team_id', id(2)], ['dance_notes', 'id', id(4)]]));
});
it('submits only the frozen request to the existing RPC and verifies the exact requester receipt', async () => {
  const { context, rpc, calls } = setup();
  expect(await submitMobileDanceProposal({ ...context, request: { version: 2, intent } })).toEqual(receipt);
  expect(rpc).toHaveBeenCalledWith('submit_shared_edit_request', { p_target_type: 'choreography', p_target_id: id(4), p_revision: 3, p_changes: intent.proposal.changes, p_reason: intent.proposal.reason, p_request_nonce: id(6) });
  expect(calls).toContainEqual(['shared_edit_requests', 'requested_by', id(1)]);
});
it('rejects hidden/wrong-team targets before RPC and mismatched receipts after RPC', async () => {
  for (const data of [null, { ...row, team_id: id(99) }, { ...row, id: id(99) }]) {
    const { context, rpc } = setup(data); await expect(submitMobileDanceProposal({ ...context, request: { version: 2, intent } })).rejects.toMatchObject({ status: expect.any(Number) }); expect(rpc).not.toHaveBeenCalled();
  }
  const { context } = setup(row, { ...receipt.request, requested_by: id(99) });
  await expect(submitMobileDanceProposal({ ...context, request: { version: 2, intent } })).rejects.toMatchObject({ status: 503 });
});
it('keeps auth/nonce failures and aborted replies unconfirmed rather than fabricating success', async () => {
  for (const [code, status] of [['42501', 403], ['22023', 409], ['XX000', 503]] as const) {
    const { context } = setup(row, receipt.request, code); await expect(submitMobileDanceProposal({ ...context, request: { version: 2, intent } })).rejects.toMatchObject({ status });
  }
  const { context, rpc } = setup(); const controller = new AbortController(); controller.abort();
  await expect(submitMobileDanceProposal({ ...context, signal: controller.signal, request: { version: 2, intent } })).rejects.toThrow(); expect(rpc).not.toHaveBeenCalled();
});
