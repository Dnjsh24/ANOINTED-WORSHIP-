// @vitest-environment node
import { expect, it } from 'vitest';
import { assertOwnershipTransferWriteScope, assertOwnershipTransferScope, assertMobileOwnershipTransferResponse, assertMobileOwnershipTransferReceipt, assertMobileOwnershipTransferState, mobileOwnershipTransferRequestSchema } from './ownership-transfer';
import { ownershipTransferIdentity as identity, ownershipTransferRequest as request, ownershipTransferReceipt as receipt, ownershipTransferResponse as response, ownershipTransferState as state, ownershipTransferCurrentIdentity as demoted, ownershipTransferId as id } from './ownership-transfer-test-fixture';
it('accepts the exact owner transition and narrowly bound demoted-actor receipt recovery', () => {
  expect(mobileOwnershipTransferRequestSchema.parse(request)).toEqual(request);
  expect(assertMobileOwnershipTransferReceipt(demoted, request, receipt)).toEqual(receipt);
  expect(assertMobileOwnershipTransferResponse(identity, request, response)).toEqual(response);
  assertOwnershipTransferScope(demoted, request); expect(() => assertOwnershipTransferWriteScope(demoted, request)).toThrow();
  const input = { targetMemberId: request.base.target.id, requestNonce: request.requestNonce };
  expect(assertMobileOwnershipTransferState(identity, input, { ...state, identity: demoted, requestNonce: request.requestNonce, current: receipt.current }).identity.role).toBe('admin');
});
it('rejects fresh admin writes, self/owner/inactive targets and changed actor bindings', () => {
  for (const actor of [{ ...identity, role: 'admin' }, { ...identity, permissions: [] }]) expect(() => assertOwnershipTransferWriteScope(actor, request)).toThrow();
  for (const target of [{ ...request.base.target, role: 'owner' }, { ...request.base.target, status: 'inactive' }, { ...request.base.target, id: identity.memberId }, { ...request.base.target, profileId: identity.userId }]) expect(mobileOwnershipTransferRequestSchema.safeParse({ ...request, base: { ...request.base, target } }).success).toBe(false);
  expect(mobileOwnershipTransferRequestSchema.safeParse({ ...request, base: { ...request.base, ownerId: id(90) } }).success).toBe(false);
});
it('rejects forged results, stale identities and recovery without the nonce', () => {
  for (const current of [{ ...receipt.current, ownerId: identity.userId }, { ...receipt.current, actor: { ...receipt.current.actor, role: 'owner' } }, { ...receipt.current, target: request.base.target }]) expect(() => assertMobileOwnershipTransferReceipt(identity, request, { ...receipt, current })).toThrow();
  for (const value of [{ ...response, identity }, { ...response, identity: { ...demoted, memberId: id(90) } }, { ...response, receipt: { ...receipt, request: { ...request, requestNonce: id(90) } } }, { ...response, extra: true }]) expect(() => assertMobileOwnershipTransferResponse(identity, request, value)).toThrow();
  expect(() => assertMobileOwnershipTransferState(identity, { targetMemberId: state.targetMemberId }, { ...state, identity: demoted, current: receipt.current })).toThrow();
  expect(() => assertMobileOwnershipTransferState(identity, { targetMemberId: state.targetMemberId, requestNonce: request.requestNonce }, { ...state, identity: demoted, requestNonce: request.requestNonce, current: { ...receipt.current, target: { ...request.base.target, role: 'admin' } } })).toThrow();
});
