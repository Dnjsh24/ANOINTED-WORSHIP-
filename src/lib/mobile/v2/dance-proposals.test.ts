import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { mobileDanceProposalIntentSchema as intentSchema, mobileDanceProposalReceiptSchema as receiptSchema, assertDanceProposalReceipt } from './dance-proposals';
import { assertMobileDanceProposalSnapshot, assertMobileDanceProposalReceipt, mobileDanceProposalIntentSchema } from './dance-proposals';
import { danceProposalSnapshot as snapshot, danceProposalIntent as intent, danceProposalReceipt as receipt, danceProposalId as id } from './dance-proposal-test-fixture';
it('keeps the shared edit revision distinct and validates selected actor/team/member snapshots', () => {
  expect(assertMobileDanceProposalSnapshot(snapshot.identity, id(4), snapshot).chart).toMatchObject({ syncRevision: 12, sharedEditRevision: 3 });
  for (const identity of [{ ...snapshot.identity, userId: id(90) }, { ...snapshot.identity, teamId: id(91) }, { ...snapshot.identity, memberId: id(92) }]) expect(() => assertMobileDanceProposalSnapshot(identity, id(4), snapshot)).toThrow();
  expect(() => assertMobileDanceProposalSnapshot(snapshot.identity, id(90), snapshot)).toThrow();
});
it('rejects substituted proposal confirmations while allowing an independent reviewer identity', () => {
  expect(assertMobileDanceProposalReceipt(snapshot.identity, id(4), { version: 2, intent }, receipt)).toEqual(receipt);
  for (const change of [{ team_id: id(90) }, { requested_by: id(90) }, { target_id: id(90) }, { request_nonce: id(90) }, { base_revision: 12 }, { changes: { title: 'Forged' } }, { reason: 'Forged' }]) {
    expect(() => assertMobileDanceProposalReceipt(snapshot.identity, id(4), { version: 2, intent }, { ...receipt, request: { ...receipt.request, ...change } })).toThrow();
  }
  expect(assertMobileDanceProposalReceipt(snapshot.identity, id(4), { version: 2, intent }, { ...receipt, request: { ...receipt.request, status: 'approved', reviewed_by: id(99), reviewed_at: '2026-10-21T05:00:00Z' } }).request.reviewed_by).toBe(id(99));
});
it('refuses link changes, empty changes, unbounded reasons and non-Dance requests', () => {
  for (const proposal of [{ ...intent.proposal, changes: {} }, { ...intent.proposal, changes: { song_id: id(9) } }, { ...intent.proposal, reason: 'x'.repeat(1001) }, { ...intent.proposal, targetType: 'song' }]) expect(mobileDanceProposalIntentSchema.safeParse({ ...intent, proposal }).success).toBe(false);
});

it.runIf(Boolean(process.env.MOBILE_DANCE_PROPOSAL_PG_CASES))('validates executed PostgreSQL pending and needs_revision replies with the runtime SDK', () => {
  const rows = z.array(z.object({ name: z.string(), intent: intentSchema, receipt: receiptSchema }).strict()).length(2)
    .parse(JSON.parse(readFileSync(process.env.MOBILE_DANCE_PROPOSAL_PG_CASES!, 'utf8').replace(/^\uFEFF/, '')));
  for (const row of rows) assertDanceProposalReceipt(row.intent, row.receipt);
  expect(rows.find(row => row.name === 'member-submit-exact-retry')?.receipt.request.status).toBe('pending');
  expect(rows.find(row => row.name === 'stale-needs-revision')?.receipt.request.status).toBe('needs_revision');
});
