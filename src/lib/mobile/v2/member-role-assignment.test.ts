// @vitest-environment node
import { expect, it } from 'vitest';
import { teamRoles } from '../../types';
import { assertMemberRoleAssignmentScope, assertMobileMemberRoleAssignmentReceipt, assertMobileMemberRoleState, mobileMemberRoleAssignmentRequestSchema } from './member-role-assignment';
import { memberRoleAssignmentIdentity as identity, memberRoleAssignmentRequest as request, memberRoleAssignmentReceipt as receipt, memberRoleAssignmentState as state, memberRoleAssignmentId as id } from './member-role-assignment-test-fixture';
const customRole = { id: id(9), teamId: identity.teamId, name: '', permissions: ['team.manage', 'events.manage'], createdAt: null };
it('accepts all eight non-owner built-ins and exact legacy custom fingerprints', () => {
  for (const role of teamRoles.filter(role => role !== 'owner')) expect(mobileMemberRoleAssignmentRequestSchema.parse({ ...request, value: { role, customRole: null } }).value.role).toBe(role);
  expect(mobileMemberRoleAssignmentRequestSchema.parse({ ...request, value: { role: 'member', customRole } }).value.customRole).toEqual(customRole);
  for (const value of [{ role: 'owner', customRole: null }, { role: 'admin', customRole }, { role: 'member', customRole: { ...customRole, teamId: id(90) } }, { ...request.value, extra: true }]) expect(mobileMemberRoleAssignmentRequestSchema.safeParse({ ...request, value }).success).toBe(false);
});
it('requires matching owner/admin, effective permission, another member and a non-owner base', () => {
  assertMemberRoleAssignmentScope({ ...identity, role: 'admin' }, request);
  for (const actor of [{ ...identity, role: 'member' }, { ...identity, permissions: [] }, { ...identity, userId: id(90) }]) expect(() => assertMemberRoleAssignmentScope(actor, request)).toThrow();
  for (const base of [{ ...request.base, id: identity.memberId }, { ...request.base, profileId: identity.userId }, { ...request.base, role: 'owner' as const }]) expect(() => assertMemberRoleAssignmentScope(identity, { ...request, base })).toThrow();
});
it('validates applied, conflict, missing and role-fingerprint blocking without accepting forged outcomes', () => {
  expect(assertMobileMemberRoleAssignmentReceipt(identity, request, receipt)).toEqual(receipt);
  expect(assertMobileMemberRoleAssignmentReceipt(identity, request, { ...receipt, status: 'missing', current: null }).status).toBe('missing');
  expect(assertMobileMemberRoleAssignmentReceipt(identity, request, { ...receipt, status: 'conflict', current: { ...request.base, profileId: id(90) } }).status).toBe('conflict');
  const customRequest = { ...request, value: { role: 'member', customRole } };
  for (const reason of ['custom_role_missing', 'custom_role_changed']) expect(assertMobileMemberRoleAssignmentReceipt(identity, mobileMemberRoleAssignmentRequestSchema.parse(customRequest), { ...receipt, request: customRequest, status: 'blocked', reason, current: request.base }).status).toBe('blocked');
  for (const result of [{ ...receipt, current: null }, { ...receipt, current: { ...receipt.current, status: 'inactive' } }, { ...receipt, current: { ...receipt.current, createdAt: '2026-10-23T01:00:00Z' } },
    { ...receipt, status: 'conflict', current: request.base }, { ...receipt, status: 'missing', current: request.base }, { ...receipt, status: 'blocked', current: request.base, reason: 'custom_role_missing' },
    { ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, secret: true }]) expect(() => assertMobileMemberRoleAssignmentReceipt(identity, request, result)).toThrow();
});
it('permits reading self/owner state while rejecting mismatched targets, identity and teams', () => {
  expect(assertMobileMemberRoleState(identity, request.base.id, state)).toEqual(state);
  expect(assertMobileMemberRoleState(identity, identity.memberId, { ...state, targetMemberId: identity.memberId, current: { ...request.base, id: identity.memberId, profileId: identity.userId, role: 'owner' } }).current?.role).toBe('owner');
  for (const value of [{ ...state, targetMemberId: id(90) }, { ...state, identity: { ...identity, memberId: id(90) } }, { ...state, current: { ...request.base, teamId: id(90) } }, { ...state, extra: true }]) expect(() => assertMobileMemberRoleState(identity, request.base.id, value)).toThrow();
});
