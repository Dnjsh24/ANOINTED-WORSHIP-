import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { assertMemberRequestBatchScope, assertMobileMemberRequestBatchReceipt, mobileMemberRequestBatchRequestSchema, mobileMemberRequestBatchReceiptSchema } from './member-request-batch';
import { memberRequestBatchIdentity as identity, memberRequestBatchRequest as request, memberRequestBatchReceipt as receipt, memberRequestBatchId as id } from './member-request-batch-test-fixture';

const first = request.decisions[0];
const second = { ...first, requestId: id(20), requestNonce: id(21) };
it('accepts one through100 sorted same-actor approvals with distinct immutable nonces', () => {
  expect(mobileMemberRequestBatchRequestSchema.parse(request)).toEqual(request);
  const decisions = Array.from({ length: 100 }, (_, index) => ({ ...first, requestId: id(100 + index), requestNonce: id(300 + index) }));
  expect(mobileMemberRequestBatchRequestSchema.parse({ ...request, decisions }).decisions).toHaveLength(100);
  expect(mobileMemberRequestBatchRequestSchema.safeParse({ ...request, decisions: [...decisions, { ...first, requestId: id(200), requestNonce: id(500) }] }).success).toBe(false);
});
it('rejects foreign scopes, rejection, aliases, duplicate targets/nonces and unsorted batches', () => {
  for (const decisions of [[], [first, first], [second, first], [first, { ...second, requestNonce: first.requestNonce }], [{ ...first, requestNonce: request.requestNonce }],
    [{ ...first, decision: 'rejected' }], [{ ...first, userId: id(90) }], [{ ...first, teamId: id(90) }], [{ ...first, memberId: id(90) }],
    [{ ...first, requestId: '99200000-0000-4000-8000-00000000000A' }]]) expect(mobileMemberRequestBatchRequestSchema.safeParse({ ...request, decisions }).success).toBe(false);
});
it('checks both current permissions and every requested role before historical receipt confirmation', () => {
  expect(() => assertMemberRequestBatchScope(identity, request)).not.toThrow();
  for (const actor of [{ ...identity, permissions: ['members.manage' as const] }, { ...identity, permissions: ['join_requests.review' as const] }, { ...identity, role: 'member' }, { ...identity, teamId: id(90) }]) expect(() => assertMemberRequestBatchScope(actor, request)).toThrow();
  const memberOnly = { ...request, decisions: [{ ...first, base: { ...first.base, requestedRole: 'member' as const } }] };
  expect(() => assertMemberRequestBatchScope({ ...identity, role: 'member' }, memberOnly)).not.toThrow();
});
it('binds outer and every child receipt exactly, in order, without an all-approved status', () => {
  expect(assertMobileMemberRequestBatchReceipt(identity, request, receipt)).toEqual(receipt);
  for (const result of [{ ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, receipts: [] }, { ...receipt, status: 'applied' },
    { ...receipt, receipts: [{ ...receipt.receipts[0], request: { ...first, requestNonce: id(90) } }] },
    { ...receipt, receipts: [{ ...receipt.receipts[0], membership: { ...receipt.receipts[0].membership, teamId: id(90) } }] },
    { ...receipt, recordedAt: '2026-10-22T01:00:00Z' }]) expect(() => assertMobileMemberRequestBatchReceipt(identity, request, result)).toThrow();
  const both = { ...request, decisions: [first, second] };
  const missing = { ...receipt.receipts[0], request: second, status: 'missing', current: null, membership: null };
  const mixed = { ...receipt, request: both, receipts: [receipt.receipts[0], missing] };
  expect(assertMobileMemberRequestBatchReceipt(identity, both, mixed).receipts.map(row => row.status)).toEqual(['applied', 'missing']);
  expect(() => assertMobileMemberRequestBatchReceipt(identity, both, { ...mixed, receipts: [...mixed.receipts].reverse() })).toThrow();
});
it.runIf(Boolean(process.env.MOBILE_MEMBER_REQUEST_BATCH_PG_CASES))('validates actual persisted nestedSQL receipts through reused single-decision SDK assertions', () => {
  const rows = z.array(z.object({ request: mobileMemberRequestBatchRequestSchema, receipt: mobileMemberRequestBatchReceiptSchema }).strict()).min(4)
    .parse(JSON.parse(readFileSync(process.env.MOBILE_MEMBER_REQUEST_BATCH_PG_CASES!, 'utf8').replace(/^\uFEFF/, '')));
  for (const row of rows) assertMobileMemberRequestBatchReceipt({ ...identity, userId: row.request.userId, teamId: row.request.teamId, memberId: row.request.memberId }, row.request, row.receipt);
  for (const status of ['applied', 'blocked', 'conflict', 'missing']) expect(rows.some(row => row.receipt.receipts.some(child => child.status === status))).toBe(true);
});
