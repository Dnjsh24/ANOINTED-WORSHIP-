// @vitest-environment node
import { expect, it } from 'vitest';
import { assertPersonPermissionOverrideScope, assertMobilePersonPermissionOverrideReceipt, assertMobilePersonPermissionOverrideState, mobilePersonPermissionOverrideRequestSchema } from './person-permission-override';
import { personPermissionOverrideIdentity as identity, personPermissionOverrideRequest as request, personPermissionOverrideReceipt as receipt, personPermissionOverrideState as state, personPermissionOverrideId as id } from './person-permission-override-test-fixture';
it('preserves exact active member and override base and validates all outcomes', () => {
  expect(mobilePersonPermissionOverrideRequestSchema.parse(request)).toEqual(request);
  expect(assertMobilePersonPermissionOverrideReceipt(identity, request, receipt)).toEqual(receipt);
  expect(assertMobilePersonPermissionOverrideReceipt(identity, request, { ...receipt, status: 'missing', current: null }).current).toBeNull();
  for (const member of [{ ...request.base.member, status: 'inactive' }, { ...request.base.member, role: 'owner' }, { ...request.base.member, profileId: id(90) }]) expect(assertMobilePersonPermissionOverrideReceipt(identity, request, { ...receipt, status: 'conflict', current: { member, override: null } }).status).toBe('conflict');
  const inherit = mobilePersonPermissionOverrideRequestSchema.parse({ ...request, value: 'inherit' });
  expect(assertMobilePersonPermissionOverrideReceipt(identity, inherit, { ...receipt, request: inherit, current: inherit.base }).status).toBe('applied');
});
it('requires owner authority and another active non-owner member', () => {
  for (const change of [{ userId: id(90) }, { role: 'admin' }, { permissions: [] }]) expect(() => assertPersonPermissionOverrideScope({ ...identity, ...change }, request)).toThrow();
  for (const member of [{ ...request.base.member, id: identity.memberId }, { ...request.base.member, profileId: identity.userId }, { ...request.base.member, role: 'owner' as const }]) expect(() => assertPersonPermissionOverrideScope(identity, { ...request, base: { ...request.base, member } })).toThrow();
  expect(mobilePersonPermissionOverrideRequestSchema.safeParse({ ...request, base: { ...request.base, member: { ...request.base.member, status: 'inactive' } } }).success).toBe(false);
});
it('rejects mismatched slots, forged applied rows and changed immutable receipts', () => {
  for (const change of [{ permission: 'messages.send' }, { value: 'unexpected' }, { targetRole: 'admin' }, { base: { ...request.base, member: { ...request.base.member, teamId: id(90) } } }]) expect(mobilePersonPermissionOverrideRequestSchema.safeParse({ ...request, ...change }).success).toBe(false);
  for (const result of [{ ...receipt, current: null }, { ...receipt, current: request.base }, { ...receipt, status: 'conflict', current: request.base }, { ...receipt, status: 'missing' }, { ...receipt, reason: null },
    { ...receipt, current: { ...receipt.current, member: { ...request.base.member, profileId: id(90) } } }, { ...receipt, request: { ...request, requestNonce: id(90) } }]) expect(() => assertMobilePersonPermissionOverrideReceipt(identity, request, result)).toThrow();
});
it('allows read-only inactive and owner state while verifying identity, member and permission', () => {
  const input = { targetMemberId: request.base.member.id, permission: request.permission };
  expect(assertMobilePersonPermissionOverrideState(identity, input, state)).toEqual(state);
  expect(assertMobilePersonPermissionOverrideState(identity, input, { ...state, current: { ...state.current, member: { ...request.base.member, status: 'inactive' }, override: null } }).current?.member.status).toBe('inactive');
  for (const result of [{ ...state, targetMemberId: id(90) }, { ...state, permission: 'songs.edit' }, { ...state, identity: { ...identity, memberId: id(90) } }, { ...state, extra: true }]) expect(() => assertMobilePersonPermissionOverrideState(identity, input, result)).toThrow();
});
