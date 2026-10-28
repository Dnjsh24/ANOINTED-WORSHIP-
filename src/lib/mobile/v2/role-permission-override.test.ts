// @vitest-environment node
import { expect, it } from 'vitest';
import { assertRolePermissionOverrideScope, assertMobileRolePermissionOverrideReceipt, assertMobileRolePermissionOverrideState,
  mobileRolePermissionOverrideQuerySchema, mobileRolePermissionOverrideRequestSchema, mobileRolePermissionOverrideRowSchema } from './role-permission-override';
import { rolePermissionOverrideIdentity as identity, rolePermissionOverrideRequest as request, rolePermissionOverrideReceipt as receipt, rolePermissionOverrideState as state, rolePermissionOverrideId as id } from './role-permission-override-test-fixture';
const base = mobileRolePermissionOverrideRowSchema.parse(request.base);
it('accepts exactly the eight built-in roles, seven editable permissions and three override values', () => {
  for (const targetRole of mobileRolePermissionOverrideQuerySchema.shape.targetRole.options) for (const permission of mobileRolePermissionOverrideQuerySchema.shape.permission.options) for (const value of ['inherit', 'allow', 'deny']) expect(mobileRolePermissionOverrideRequestSchema.safeParse({ ...request, targetRole, permission, base: null, value }).success).toBe(true);
  for (const change of [{ targetRole: 'owner' }, { targetRole: id(90) }, { permission: 'messages.send' }, { value: 'maybe' }, { memberIds: [] }, { base: { ...base, role: 'member' } }, { base: { ...base, permission: 'files.upload' } }]) expect(mobileRolePermissionOverrideRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
});
it('requires matching owner identity and effective team.manage', () => {
  for (const change of [{ userId: id(90) }, { memberId: id(90) }, { teamId: id(90) }, { role: 'admin' }, { permissions: [] }]) expect(() => assertRolePermissionOverrideScope({ ...identity, ...change }, request)).toThrow();
});
it('validates exact applied and nullable conflict outcomes without fabricated acceptance', () => {
  expect(assertMobileRolePermissionOverrideReceipt(identity, request, receipt)).toEqual(receipt);
  expect(assertMobileRolePermissionOverrideReceipt(identity, request, { ...receipt, status: 'conflict', current: null }).status).toBe('conflict');
  expect(assertMobileRolePermissionOverrideReceipt(identity, request, { ...receipt, status: 'conflict' }).status).toBe('conflict');
  const inherit = mobileRolePermissionOverrideRequestSchema.parse({ ...request, value: 'inherit', base: null });
  expect(assertMobileRolePermissionOverrideReceipt(identity, inherit, { ...receipt, request: inherit, current: null }).current).toBeNull();
  for (const result of [{ ...receipt, current: null }, { ...receipt, current: base }, { ...receipt, status: 'conflict', current: base }, { ...receipt, current: { ...base, role: 'member', allowed: false } },
    { ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, reason: null }]) expect(() => assertMobileRolePermissionOverrideReceipt(identity, request, result)).toThrow();
});
it('verifies selected state identity and exact role/permission slot', () => {
  const input = { targetRole: request.targetRole, permission: request.permission };
  expect(assertMobileRolePermissionOverrideState(identity, input, state)).toEqual(state);
  for (const result of [{ ...state, targetRole: 'member' }, { ...state, permission: 'files.upload' }, { ...state, identity: { ...identity, memberId: id(90) } }, { ...state, current: { ...base, teamId: id(90) } }, { ...state, extra: true }]) expect(() => assertMobileRolePermissionOverrideState(identity, input, result)).toThrow();
});
