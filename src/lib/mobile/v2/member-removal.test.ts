// @vitest-environment node
import { expect, it } from 'vitest';
import { assertMemberRemovalScope, assertMobileMemberRemovalReceipt, mobileMemberRemovalRequestSchema } from './member-removal';
import { memberRemovalIdentity as identity, memberRemovalRequest as request, memberRemovalReceipt as receipt, memberRemovalId as id } from './member-removal-test-fixture';
it('preserves the complete saved membership and validates all four removal outcomes', () => {
  expect(mobileMemberRemovalRequestSchema.parse(request)).toEqual(request);
  for (const status of ['applied', 'missing'] as const) expect(assertMobileMemberRemovalReceipt(identity, request, { ...receipt, status }).status).toBe(status);
  expect(assertMobileMemberRemovalReceipt(identity, request, { ...receipt, status: 'conflict', current: { ...request.base, profileId: id(90) } }).status).toBe('conflict');
  expect(assertMobileMemberRemovalReceipt(identity, request, { ...receipt, status: 'blocked', reason: 'related_records', current: request.base }).status).toBe('blocked');
});
it('requires matching owner/admin authority and another non-owner member', () => {
  assertMemberRemovalScope({ ...identity, role: 'admin' }, request);
  for (const change of [{ role: 'member' }, { permissions: [] }, { userId: id(90) }, { teamId: id(90) }, { memberId: id(90) }]) expect(() => assertMemberRemovalScope({ ...identity, ...change }, request)).toThrow();
  for (const base of [{ ...request.base, id: identity.memberId }, { ...request.base, profileId: identity.userId }, { ...request.base, role: 'owner' as const }]) expect(() => assertMemberRemovalScope(identity, { ...request, base })).toThrow();
});
it('rejects forged, cross-team and changed immutable requests or receipt outcomes', () => {
  for (const result of [{ ...receipt, current: request.base }, { ...receipt, status: 'conflict', current: request.base }, { ...receipt, status: 'conflict', current: { ...request.base, id: id(90) } },
    { ...receipt, status: 'blocked', reason: 'related_records', current: { ...request.base, status: 'inactive' } }, { ...receipt, status: 'blocked', current: request.base },
    { ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, reason: 'related_records' }, { ...receipt, extra: true }]) expect(() => assertMobileMemberRemovalReceipt(identity, request, result)).toThrow();
  for (const result of [{ ...request, value: {} }, { ...request, base: { ...request.base, teamId: id(90) } }, { ...request, base: { ...request.base, createdAt: null } }]) expect(mobileMemberRemovalRequestSchema.safeParse(result).success).toBe(false);
});
