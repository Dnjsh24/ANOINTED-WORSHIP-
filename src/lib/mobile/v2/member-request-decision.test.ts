import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { assertMemberRequestDecisionScope, assertMobileMemberRequestDecisionReceipt, mobileMemberRequestDecisionRequestSchema, mobileMemberRequestDecisionReceiptSchema } from './member-request-decision';
import { memberRequestDecisionIdentity as identity, memberRequestDecisionRequest as request, memberRequestDecisionReceipt as receipt, memberRequestDecisionId as id } from './member-request-decision-test-fixture';
it('requires exact actor/team/member and both current permissions, preserving delegated role-assignment limits', () => {
  for (const actor of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(90) }, { ...identity, memberId: id(90) }, { ...identity, permissions: ['members.manage' as const] }, { ...identity, permissions: ['join_requests.review' as const] }, { ...identity, role: 'member' }]) expect(() => assertMemberRequestDecisionScope(actor, request)).toThrow();
  const delegate = { ...identity, role: 'member' };
  expect(() => assertMemberRequestDecisionScope(delegate, { ...request, decision: 'rejected' })).not.toThrow();
  expect(() => assertMemberRequestDecisionScope(delegate, { ...request, base: { ...request.base, requestedRole: 'member' } })).not.toThrow();
});
it('rejects rolepickers, bulk decisions, invalid nonces and nonpending bases', () => {
  for (const value of [{ ...request, role: 'admin' }, { ...request, requestIds: [request.requestId] }, { ...request, requestNonce: 'bad' }, { ...request, decision: 'cancelled' }, { ...request, base: { ...request.base, status: 'approved' } }]) expect(mobileMemberRequestDecisionRequestSchema.safeParse(value).success).toBe(false);
});
it('binds every terminal receipt to its exact request, target and newly-approved membership scope', () => {
  expect(assertMobileMemberRequestDecisionReceipt(identity, request, receipt)).toEqual(receipt);
  for (const result of [{ ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, current: { ...receipt.current, id: id(90) } }, { ...receipt, current: { ...receipt.current, teamId: id(90) } },
    { ...receipt, current: { ...receipt.current, reviewedBy: id(90) } }, { ...receipt, membership: { ...receipt.membership, teamId: id(90) } }, { ...receipt, membership: { ...receipt.membership, profileId: id(90) } },
    { ...receipt, membership: { ...receipt.membership, role: 'admin' } }, { ...receipt, membership: { ...receipt.membership, status: 'inactive' } }, { ...receipt, membership: null }, { ...receipt, reason: 'existing_membership' }]) expect(() => assertMobileMemberRequestDecisionReceipt(identity, request, result)).toThrow();
});
it('confirms rejection without claiming membership creation or alteration', () => {
  const rejected = { ...request, decision: 'rejected' as const };
  const result = { ...receipt, request: rejected, current: { ...receipt.current, status: 'rejected' }, membership: null };
  expect(assertMobileMemberRequestDecisionReceipt(identity, rejected, result).membership).toBeNull();
  expect(() => assertMobileMemberRequestDecisionReceipt(identity, rejected, { ...result, membership: receipt.membership })).toThrow();
});
it('keeps blocked existing/privileged requests pending and distinguishes missing/current conflicts', () => {
  const pending = { id: request.requestId, teamId: request.teamId, ...request.base, reviewedBy: null, reviewedAt: null };
  expect(assertMobileMemberRequestDecisionReceipt(identity, request, { ...receipt, status: 'blocked', current: pending, reason: 'existing_membership' }).status).toBe('blocked');
  const privileged = { ...request, base: { ...request.base, requestedRole: 'owner' as const } };
  expect(assertMobileMemberRequestDecisionReceipt(identity, privileged, { ...receipt, request: privileged, status: 'blocked', current: { ...pending, requestedRole: 'owner' }, membership: null, reason: 'privileged_request' }).status).toBe('blocked');
  expect(assertMobileMemberRequestDecisionReceipt(identity, request, { ...receipt, status: 'missing', current: null, membership: null }).status).toBe('missing');
  expect(assertMobileMemberRequestDecisionReceipt(identity, request, { ...receipt, status: 'conflict', membership: null }).status).toBe('conflict');
  expect(() => assertMobileMemberRequestDecisionReceipt(identity, request, { ...receipt, status: 'conflict', current: pending, membership: null })).toThrow();
});
it.runIf(Boolean(process.env.MOBILE_MEMBER_REQUEST_DECISION_PG_CASES))('validates real isolatedSQL applied/conflict/missing/blocked receipts against SDK schemas', () => {
  const rows = z.array(z.object({ request: mobileMemberRequestDecisionRequestSchema, receipt: mobileMemberRequestDecisionReceiptSchema }).strict()).min(8)
    .parse(JSON.parse(readFileSync(process.env.MOBILE_MEMBER_REQUEST_DECISION_PG_CASES!, 'utf8').replace(/^\uFEFF/, '')));
  for (const row of rows) assertMobileMemberRequestDecisionReceipt({ ...identity, userId: row.request.userId, teamId: row.request.teamId, memberId: row.request.memberId }, row.request, row.receipt);
  for (const status of ['applied', 'conflict', 'missing', 'blocked']) expect(rows.some(row => row.receipt.status === status)).toBe(true);
});
