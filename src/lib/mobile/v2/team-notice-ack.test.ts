import { expect, it } from 'vitest';
import { assertTeamNoticeAckReceipt, teamNoticeAckRequestSchema } from './team-notice-ack';
import { teamNoticeIdentity as identity, teamNoticeId as id } from './team-notices-test-fixture';
const request = { version: 2 as const, kind: 'announcement' as const, targetId: id(4), requestNonce: id(9), acknowledged: true as const };
const receipt = { ...request, userId: identity.userId, teamId: identity.teamId, memberId: identity.memberId, acknowledgedAt: '2026-10-21T00:00:00Z' };
it('accepts only own monotonic acknowledgement confirmations and actual persisted timestamps', () => {
  expect(assertTeamNoticeAckReceipt(identity, request, receipt)).toEqual(receipt);
  for (const change of [{ acknowledged: false }, { profileId: id(90) }, { requestNonce: 'invalid' }, { kind: 'other' }]) expect(teamNoticeAckRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
});
it('rejects scope, target, kind and nonce substitutions', () => {
  for (const change of [{ userId: id(90) }, { teamId: id(90) }, { memberId: id(90) }, { targetId: id(90) }, { requestNonce: id(90) }, { kind: 'reminder' }, { acknowledgedAt: null }]) expect(() => assertTeamNoticeAckReceipt(identity, request, { ...receipt, ...change })).toThrow();
});
