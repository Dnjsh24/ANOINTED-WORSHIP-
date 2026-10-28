import { expect, it } from 'vitest';
import { assertMobileSupportRequestCloseReceipt, mobileSupportRequestCloseRequestSchema } from './support-request-close';
const id = '99910000-0000-4000-8000-000000000001'; const time = '2026-10-23T04:00:00.123456Z';
export const supportCloseRequest = { version: 2 as const, userId: id, requestId: id, requestNonce: id, base: { createdAt: time, status: 'open' as const, updatedAt: time, supportUpdatedAt: null } };
it('requires a reviewed open snapshot and binds historical applied/conflict/missing receipts', () => {
  const receipt = { version: 2, request: supportCloseRequest, status: 'applied', current: { ...supportCloseRequest.base, status: 'closed' }, recordedAt: time };
  expect(assertMobileSupportRequestCloseReceipt(id, supportCloseRequest, receipt)).toEqual(receipt);
  expect(mobileSupportRequestCloseRequestSchema.safeParse({ ...supportCloseRequest, base: { ...supportCloseRequest.base, status: 'closed' } }).success).toBe(false);
  expect(() => assertMobileSupportRequestCloseReceipt(id, supportCloseRequest, { ...receipt, status: 'conflict', current: supportCloseRequest.base })).toThrow();
  expect(() => assertMobileSupportRequestCloseReceipt(id, supportCloseRequest, { ...receipt, request: { ...supportCloseRequest, requestNonce: '99910000-0000-4000-8000-000000000002' } })).toThrow();
});
