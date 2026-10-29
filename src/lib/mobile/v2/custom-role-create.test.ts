import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { assertCustomRoleCreateScope, assertMobileCustomRoleCreateReceipt, mobileCustomRoleCreateRequestSchema, mobileCustomRoleCreateReceiptSchema } from './custom-role-create';
import { customRoleCreateIdentity as identity, customRoleCreateRequest as request, customRoleCreateReceipt as receipt, customRoleCreateId as id } from './custom-role-create-test-fixture';

it('requires exact current owner and effective team-management authority rather than admin or custom grants', () => {
  expect(() => assertCustomRoleCreateScope(identity, request)).not.toThrow();
  for (const actor of [{ ...identity, role: 'admin' }, { ...identity, role: 'member' }, { ...identity, permissions: [] }, { ...identity, userId: id(90) }, { ...identity, teamId: id(90) }, { ...identity, memberId: id(90) }]) expect(() => assertCustomRoleCreateScope(actor, request)).toThrow();
  const rawDraft = { ...request, name: '' }; expect(() => assertCustomRoleCreateScope(identity, rawDraft)).not.toThrow();
});
it('accepts empty permissions and bounded names but rejects unknown, duplicate or unsorted permissions and assignment fields', () => {
  expect(mobileCustomRoleCreateRequestSchema.parse({ ...request, permissions: [] }).permissions).toEqual([]);
  expect(mobileCustomRoleCreateRequestSchema.safeParse({ ...request, name: 'x'.repeat(160) }).success).toBe(true);
  for (const value of [{ ...request, name: '' }, { ...request, name: ' x ' }, { ...request, name: 'x'.repeat(161) }, { ...request, permissions: ['system.superuser'] },
    { ...request, permissions: ['team.manage', 'events.manage'] }, { ...request, permissions: ['events.manage', 'events.manage'] }, { ...request, description: 'invented' }, { ...request, memberIdToAssign: id(90) }]) expect(mobileCustomRoleCreateRequestSchema.safeParse(value).success).toBe(false);
});
it('binds every applied receipt to exact actor intent, team, name, permissions and actual creation time', () => {
  expect(assertMobileCustomRoleCreateReceipt(identity, request, receipt)).toEqual(receipt);
  for (const value of [{ ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, current: null }, { ...receipt, reason: 'existing_role' },
    ...[{ teamId: id(90) }, { name: 'Other' }, { permissions: [] }, { createdAt: '2030-01-01T00:00:00Z' }, { description: null }].map(change => ({ ...receipt, current: { ...receipt.current, ...change } })), { ...receipt, membership: { id: id(90) } }]) expect(() => assertMobileCustomRoleCreateReceipt(identity, request, value)).toThrow();
});
it('confirms duplicate blocking without revealing or overwriting an existing role', () => {
  expect(assertMobileCustomRoleCreateReceipt(identity, request, { ...receipt, status: 'blocked', current: null, reason: 'existing_role' }).status).toBe('blocked');
  expect(() => assertMobileCustomRoleCreateReceipt(identity, request, { ...receipt, status: 'blocked', reason: 'existing_role' })).toThrow();
  expect(() => assertMobileCustomRoleCreateReceipt(identity, request, { ...receipt, status: 'blocked', current: null })).toThrow();
});
it.runIf(Boolean(process.env.MOBILE_CUSTOM_ROLE_CREATE_PG_CASES))('validates persistedSQL applied and duplicate receipts with SDK assertions', () => {
  const rows = z.array(z.object({ request: mobileCustomRoleCreateRequestSchema, receipt: mobileCustomRoleCreateReceiptSchema }).strict()).min(6)
    .parse(JSON.parse(readFileSync(process.env.MOBILE_CUSTOM_ROLE_CREATE_PG_CASES!, 'utf8').replace(/^\uFEFF/, '')));
  for (const row of rows) assertMobileCustomRoleCreateReceipt({ ...identity, userId: row.request.userId, teamId: row.request.teamId, memberId: row.request.memberId }, row.request, row.receipt);
  expect(rows.some(row => row.receipt.status === 'applied')).toBe(true); expect(rows.some(row => row.receipt.status === 'blocked')).toBe(true);
});
