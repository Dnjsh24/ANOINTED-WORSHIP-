import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { expect, it } from 'vitest';
import { assertMobileProfileEditReceipt, mobileProfileEditRequestSchema, mobileProfileEditReceiptSchema } from './profile-edit';
import { profileEditIdentity as identity, profileEditRequest as request, profileEditReceipt as receipt } from './profile-edit-test-fixture';
import { profileTestId as id } from './profile-test-fixture';
it('validates exact own-profile intent and applied receipt without editable email/avatar/account fields', () => {
  expect(assertMobileProfileEditReceipt(identity, request, receipt)).toEqual(receipt);
  for (const value of [{ ...request.value, email: 'changed@example.test' }, { ...request.value, avatarUrl: 'https://example.test/pic' }, { ...request.value, role: 'admin' },
    { ...request.value, phone: '555' }, { ...request.value, fullName: '' }, { ...request.value, fullName: ' Untrimmed ' }, { ...request.value, birthday: '2026-02-30' }, { ...request.value, ministries: ['x'.repeat(161)] }]) expect(mobileProfileEditRequestSchema.safeParse({ ...request, value }).success).toBe(false);
});
it('rejects substituted immutable identity/nonce/base/value and fabricated receipt outcomes', () => {
  for (const change of [{ userId: id(90) }, { teamId: id(90) }, { memberId: id(90) }, { requestNonce: id(90) }, { base: { ...request.base, fullName: 'Substituted base' } },
    { value: { ...request.value, fullName: 'Substituted value' } }]) expect(() => assertMobileProfileEditReceipt(identity, request, { ...receipt, request: { ...request, ...change } })).toThrow();
  expect(() => assertMobileProfileEditReceipt(identity, request, { ...receipt, current: request.base })).toThrow();
  expect(() => assertMobileProfileEditReceipt(identity, request, { ...receipt, status: 'conflict', current: request.base })).toThrow();
  expect(assertMobileProfileEditReceipt(identity, request, { ...receipt, status: 'conflict', current: { ...request.base, fullName: 'Website change' } }).status).toBe('conflict');
});
it.runIf(Boolean(process.env.MOBILE_PROFILE_EDIT_PG_CASES))('validates actual isolated PostgreSQL immutable applied/conflict receipts against SDK schemas', () => {
  const rows = z.array(z.object({ identity: z.unknown(), request: mobileProfileEditRequestSchema, receipt: mobileProfileEditReceiptSchema }).strict()).min(3)
    .parse(JSON.parse(readFileSync(process.env.MOBILE_PROFILE_EDIT_PG_CASES!, 'utf8').replace(/^\uFEFF/, '')));
  for (const row of rows) assertMobileProfileEditReceipt({ ...identity, userId: row.request.userId, teamId: row.request.teamId, memberId: row.request.memberId }, row.request, row.receipt);
  expect(rows.some(row => row.receipt.status === 'applied')).toBe(true); expect(rows.some(row => row.receipt.status === 'conflict')).toBe(true);
});
