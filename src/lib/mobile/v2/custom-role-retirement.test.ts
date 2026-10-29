// @vitest-environment node
import { expect, it } from 'vitest';
import { assertCustomRoleRetirementScope, assertMobileCustomRoleRetirementReceipt, assertMobileCustomRoleRetirementState, mobileCustomRoleRetirementRequestSchema } from './custom-role-retirement';
import { customRoleRetirementIdentity as identity, customRoleRetirementRequest as request, customRoleRetirementReceipt as receipt, customRoleRetirementState as state, customRoleRetirementId as id } from './custom-role-retirement-test-fixture';
it('preserves precise role and complete ordered assignment base and all outcomes', () => {
  expect(mobileCustomRoleRetirementRequestSchema.parse(request)).toEqual(request);
  expect(assertMobileCustomRoleRetirementReceipt(identity, request, receipt)).toEqual(receipt);
  expect(assertMobileCustomRoleRetirementReceipt(identity, request, { ...receipt, status: 'missing' }).status).toBe('missing');
  expect(assertMobileCustomRoleRetirementReceipt(identity, request, { ...receipt, status: 'conflict', current: { ...request.base, members: [] } }).status).toBe('conflict');
  expect(assertMobileCustomRoleRetirementReceipt(identity, request, { ...receipt, status: 'blocked', reason: 'member_limit' }).status).toBe('blocked');
  const protectedRequest = mobileCustomRoleRetirementRequestSchema.parse({ ...request, base: { ...request.base, members: [{ ...request.base.members[0], role: 'owner' }] } });
  expect(assertMobileCustomRoleRetirementReceipt(identity, protectedRequest, { ...receipt, request: protectedRequest, status: 'blocked', current: protectedRequest.base, reason: 'protected_member' }).status).toBe('blocked');
});
it('requires matching owner and both permissions and rejects duplicate/incomplete scoped members', () => {
  for (const actor of [{ ...identity, role: 'admin' }, { ...identity, userId: id(90) }, { ...identity, permissions: ['team.manage'] as const }, { ...identity, permissions: ['members.manage'] as const }]) expect(() => assertCustomRoleRetirementScope({ ...actor, permissions: [...actor.permissions] }, request)).toThrow();
  for (const change of [{ replacementRole: 'owner' }, { base: { ...request.base, members: [request.base.members[0], request.base.members[0]] } }, { base: { ...request.base, members: [{ ...request.base.members[0], customRoleId: null }] } }, { base: { ...request.base, role: { ...request.base.role, teamId: id(90) } } }]) expect(mobileCustomRoleRetirementRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
});
it('verifies bounded state without presenting a truncated assignment list', () => {
  expect(assertMobileCustomRoleRetirementState(identity, state.roleId, state)).toEqual(state);
  expect(assertMobileCustomRoleRetirementState(identity, state.roleId, { ...state, current: null, assignedCount: 101, reason: 'member_limit' }).reason).toBe('member_limit');
  for (const result of [{ ...state, assignedCount: 2 }, { ...state, current: null }, { ...state, current: null, assignedCount: 100, reason: 'member_limit' }, { ...state, roleId: id(90) }, { ...state, identity: { ...identity, memberId: id(90) } }]) expect(() => assertMobileCustomRoleRetirementState(identity, state.roleId, result)).toThrow();
  for (const result of [{ ...receipt, current: request.base }, { ...receipt, status: 'conflict', current: request.base }, { ...receipt, status: 'blocked', current: request.base, reason: 'member_limit' }, { ...receipt, status: 'blocked', current: request.base, reason: 'protected_member' }, { ...receipt, request: { ...request, requestNonce: id(90) } }]) expect(() => assertMobileCustomRoleRetirementReceipt(identity, request, result)).toThrow();
});
