// @vitest-environment node
import { expect, it } from 'vitest';
import { assertCustomRoleEditScope, assertMobileCustomRoleEditReceipt, mobileCustomRoleEditRequestSchema } from './custom-role-edit';
import { customRoleEditIdentity as identity, customRoleEditRequest as request, customRoleEditReceipt as receipt, customRoleEditId as id } from './custom-role-edit-test-fixture';
it('preserves legacy base and validates all four outcomes', () => {
  expect(mobileCustomRoleEditRequestSchema.parse(request)).toEqual(request);
  expect(assertMobileCustomRoleEditReceipt(identity, request, receipt)).toEqual(receipt);
  expect(assertMobileCustomRoleEditReceipt(identity, request, { ...receipt, status: 'missing', current: null }).status).toBe('missing');
  expect(assertMobileCustomRoleEditReceipt(identity, request, { ...receipt, status: 'blocked', current: request.base, reason: 'existing_role' }).status).toBe('blocked');
  expect(assertMobileCustomRoleEditReceipt(identity, request, { ...receipt, status: 'conflict', current: { ...request.base, permissions: [...request.base.permissions].reverse() } }).status).toBe('conflict');
});
it('requires matching actual owner and effective team.manage', () => {
  for (const change of [{ userId: id(90) }, { teamId: id(90) }, { memberId: id(90) }, { role: 'admin' }, { permissions: [] }]) expect(() => assertCustomRoleEditScope({ ...identity, ...change }, request)).toThrow();
});
it('requires trimmed target names and canonical known permission order while leaving the base exact', () => {
  for (const value of [{ name: '', permissions: [] }, { name: ' trim ', permissions: [] }, { name: 'x'.repeat(161), permissions: [] },
    { name: 'Role', permissions: ['system.superuser'] }, { name: 'Role', permissions: ['team.manage', 'events.manage'] }, { name: 'Role', permissions: ['team.manage', 'team.manage'] }, { ...request.value, extra: true }]) expect(mobileCustomRoleEditRequestSchema.safeParse({ ...request, value }).success).toBe(false);
  expect(mobileCustomRoleEditRequestSchema.safeParse({ ...request, value: { name: 'Role', permissions: [] } }).success).toBe(true);
  for (const point of [9, 10, 160, 65279]) expect(mobileCustomRoleEditRequestSchema.safeParse({ ...request, value: { name: String.fromCharCode(point) + 'Role', permissions: [] } }).success).toBe(false);
});
it('rejects forged receipts and changed immutable requests', () => {
  for (const result of [{ ...receipt, current: null }, { ...receipt, current: request.base }, { ...receipt, current: { ...receipt.current, id: id(90) } },
    { ...receipt, current: { ...receipt.current, createdAt: '2026-10-23T01:00:00Z' } }, { ...receipt, status: 'conflict', current: request.base },
    { ...receipt, status: 'blocked', current: receipt.current, reason: 'existing_role' }, { ...receipt, status: 'missing', current: request.base },
    { ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, extra: true }]) expect(() => assertMobileCustomRoleEditReceipt(identity, request, result)).toThrow();
  expect(mobileCustomRoleEditRequestSchema.safeParse({ ...request, base: { ...request.base, teamId: id(90) } }).success).toBe(false);
});
