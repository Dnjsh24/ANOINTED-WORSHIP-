import { expect, it } from 'vitest';
import { mobileSelfMemberLeaveRequestSchema, assertMobileSelfMemberLeaveReceipt, assertMobileSelfMemberLeaveState } from './self-member-leave';
import { selfMemberLeaveRequest as request, selfMemberLeaveReceipt as receipt, selfMemberLeaveScope as scope, selfMemberLeaveState as state, selfMemberLeaveId as id } from './self-member-leave-test-fixture';
it('binds exact confirmation, own nonowner base and immutable receipt', () => {
  expect(assertMobileSelfMemberLeaveReceipt(scope, request, receipt)).toEqual(receipt);
  for (const value of [{ ...request, extra: 1 }, { ...request, confirmation: 'leave team' }, { ...request, base: { ...request.base, ownerId: scope.userId } },
    { ...request, base: { ...request.base, member: { ...request.base.member, role: 'owner' } } }]) expect(mobileSelfMemberLeaveRequestSchema.safeParse(value).success).toBe(false);
  expect(() => assertMobileSelfMemberLeaveReceipt(scope, request, { ...receipt, request: { ...request, requestNonce: id(99) } })).toThrow();
  expect(() => assertMobileSelfMemberLeaveReceipt({ ...scope, memberId: id(99) }, request, receipt)).toThrow();
});
it('accepts protected FK and owner-promotion conflict with fresh owner state but no private recovery data', () => {
  const current = { ownerId: scope.userId, member: { ...request.base.member, role: 'owner' as const } };
  expect(assertMobileSelfMemberLeaveReceipt(scope, request, { ...receipt, status: 'conflict', current }).status).toBe('conflict');
  expect(assertMobileSelfMemberLeaveReceipt(scope, request, { ...receipt, status: 'blocked', current: request.base, reason: 'related_records' }).status).toBe('blocked');
  expect(assertMobileSelfMemberLeaveState(scope, {}, { ...state, current }).current).toEqual(current);
  expect(assertMobileSelfMemberLeaveState(scope, { requestNonce: request.requestNonce }, { ...state, requestNonce: request.requestNonce, current: null }).current).toBeNull();
  expect(() => assertMobileSelfMemberLeaveState(scope, { requestNonce: request.requestNonce }, { ...state, requestNonce: request.requestNonce })).toThrow();
});
