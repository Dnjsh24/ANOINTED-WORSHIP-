import { expect, it } from 'vitest';
import { assertCustomRoleDeleteScope, assertMobileCustomRoleDeleteReceipt, mobileCustomRoleDeleteRequestSchema } from './custom-role-delete';
import { customRoleDeleteIdentity as identity, customRoleDeleteRequest as request, customRoleDeleteReceipt as receipt, customRoleDeleteId as id } from './custom-role-delete-test-fixture';
it('preserves legacy base, exact retries and all outcomes', () => {
  expect(mobileCustomRoleDeleteRequestSchema.parse(request)).toEqual(request);
  for (const status of ['applied', 'missing'] as const) expect(assertMobileCustomRoleDeleteReceipt(identity, request, { ...receipt, status }).status).toBe(status);
  expect(assertMobileCustomRoleDeleteReceipt(identity, request, { ...receipt, status: 'blocked', current: request.base, reason: 'assigned_role' }).status).toBe('blocked');
  expect(assertMobileCustomRoleDeleteReceipt(identity, request, { ...receipt, status: 'conflict', current: { ...request.base, permissions: [...request.base.permissions].reverse() } }).status).toBe('conflict');
});
it('requires matching owner and effective team.manage', () => {
  for (const change of [{ userId: id(90) }, { teamId: id(90) }, { memberId: id(90) }, { role: 'admin' as const }, { permissions: [] }]) expect(() => assertCustomRoleDeleteScope({ ...identity, ...change }, request)).toThrow();
});
it('rejects forged receipts and changed immutable requests', () => {
  for (const value of [{ ...receipt, current: request.base }, { ...receipt, status: 'blocked', current: request.base, reason: null },
    { ...receipt, status: 'conflict', current: request.base }, { ...receipt, status: 'blocked', reason: 'assigned_role', current: { ...request.base, name: 'Changed' } },
    { ...receipt, status: 'conflict', current: { ...request.base, id: id(90) } }, { ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, extra: true }]) expect(() => assertMobileCustomRoleDeleteReceipt(identity, request, value)).toThrow();
  expect(mobileCustomRoleDeleteRequestSchema.safeParse({ ...request, base: { ...request.base, teamId: id(90) } }).success).toBe(false);
});
