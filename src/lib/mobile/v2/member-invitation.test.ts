import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { assertMemberInvitationScope, assertMobileMemberInvitationReceipt, mobileMemberInvitationRequestSchema, mobileMemberInvitationReceiptSchema } from './member-invitation';
import { memberInvitationIdentity as identity, memberInvitationRequest as request, memberInvitationReceipt as receipt, memberInvitationId as id } from './member-invitation-test-fixture';

it('requires exact current actor/team/member, effective permission and assignment authority', () => {
  for (const actor of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(90) }, { ...identity, memberId: id(90) }, { ...identity, permissions: [] }]) expect(() => assertMemberInvitationScope(actor, request)).toThrow();
  const delegate = { ...identity, role: 'member' };
  expect(() => assertMemberInvitationScope(delegate, request)).not.toThrow();
  expect(() => assertMemberInvitationScope(delegate, { ...request, role: 'pastor' })).toThrow();
  expect(() => assertMemberInvitationScope(identity, { ...request, role: 'pastor' })).not.toThrow();
  const rawDraft = { ...request, email: '' };
  expect(() => assertMemberInvitationScope(identity, rawDraft)).not.toThrow();
});
it('requires canonical complete immutable fields at queue while rejecting bulk, expiry and membership grant fields', () => {
  for (const value of [{ ...request, emails: [request.email] }, { ...request, expiresAt: '2030-01-01' }, { ...request, status: 'accepted' },
    { ...request, email: request.email.toUpperCase() }, { ...request, email: 'bad' }, { ...request, email: '.bad@example.test' }, { ...request, requestNonce: 'bad' },
    { ...request, message: '' }, { ...request, message: ' x ' }, { ...request, message: 'x'.repeat(1001) }]) expect(mobileMemberInvitationRequestSchema.safeParse(value).success).toBe(false);
  expect(mobileMemberInvitationRequestSchema.parse({ ...request, message: null }).message).toBeNull();
});
it('binds applied receipts to exact email, role, message, actor, nonce, pending status and real no-expiry state', () => {
  expect(assertMobileMemberInvitationReceipt(identity, request, receipt)).toEqual(receipt);
  for (const result of [{ ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, current: null },
    ...[{ teamId: id(90) }, { email: 'other@example.test' }, { role: 'pastor' }, { message: null }, { invitedBy: id(90) }, { status: 'accepted' }, { expiresAt: '2030-01-01' }, { updatedAt: receipt.recordedAt }].map(change => ({ ...receipt, current: { ...receipt.current, ...change } }))]) expect(() => assertMobileMemberInvitationReceipt(identity, request, result)).toThrow();
});
it('confirms bounded blocked reasons without fabricating saved invitations or overwriting prior rows', () => {
  for (const reason of ['existing_invitation', 'existing_membership'] as const) expect(assertMobileMemberInvitationReceipt(identity, request, { ...receipt, status: 'blocked', current: null, reason }).status).toBe('blocked');
  const privileged = { ...request, role: 'owner' as const };
  expect(assertMobileMemberInvitationReceipt(identity, privileged, { ...receipt, request: privileged, status: 'blocked', current: null, reason: 'privileged_role' }).reason).toBe('privileged_role');
  expect(() => assertMobileMemberInvitationReceipt(identity, privileged, { ...receipt, request: privileged, current: { ...receipt.current, role: 'owner' } })).toThrow();
  for (const result of [{ ...receipt, status: 'blocked' }, { ...receipt, status: 'blocked', reason: 'existing_membership' }, { ...receipt, status: 'blocked', reason: 'privileged_role', current: null }, { ...receipt, reason: 'existing_invitation' }]) expect(() => assertMobileMemberInvitationReceipt(identity, request, result)).toThrow();
});
it.runIf(Boolean(process.env.MOBILE_MEMBER_INVITATION_PG_CASES))('validates persisted isolatedSQL receipts with the SDK assertions', () => {
  const rows = z.array(z.object({ request: mobileMemberInvitationRequestSchema, receipt: mobileMemberInvitationReceiptSchema }).strict()).min(6)
    .parse(JSON.parse(readFileSync(process.env.MOBILE_MEMBER_INVITATION_PG_CASES!, 'utf8').replace(/^\uFEFF/, '')));
  for (const row of rows) assertMobileMemberInvitationReceipt({ ...identity, userId: row.request.userId, teamId: row.request.teamId, memberId: row.request.memberId }, row.request, row.receipt);
  for (const reason of ['existing_invitation', 'existing_membership', 'privileged_role']) expect(rows.some(row => row.receipt.reason === reason)).toBe(true);
});
