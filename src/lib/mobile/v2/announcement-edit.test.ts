import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { assertAnnouncementEditScope, assertMobileAnnouncementEditReceipt, mobileAnnouncementEditRequestSchema, mobileAnnouncementEditReceiptSchema } from './announcement-edit';
import { announcementEditIdentity as identity, announcementEditRequest as request, announcementEditReceipt as receipt, announcementEditId as id, announcementEditBase as base } from './announcement-edit-test-fixture';
it('matches immutable intent fields independent of JSON object key order and confirms applied content only', () => {
  expect(assertMobileAnnouncementEditReceipt(identity, request, receipt)).toEqual(receipt);
  expect(assertMobileAnnouncementEditReceipt(identity, request, { ...receipt, request: { ...request, value: { priority: request.value.priority, body: request.value.body, title: request.value.title, category: request.value.category } } })).toEqual(receipt);
  for (const result of [{ ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, current: base }, { ...receipt, current: { ...receipt.current, eventId: id(90) } }, { ...receipt, secret: true }]) expect(() => assertMobileAnnouncementEditReceipt(identity, request, result)).toThrow();
});
it.runIf(Boolean(process.env.MOBILE_ANNOUNCEMENT_EDIT_PG_CASES))('validates actual isolated SQL applied/conflict/missing receipts against the SDK boundary', () => {
  const rows = z.array(z.object({ request: mobileAnnouncementEditRequestSchema, receipt: mobileAnnouncementEditReceiptSchema }).strict()).min(8)
    .parse(JSON.parse(readFileSync(process.env.MOBILE_ANNOUNCEMENT_EDIT_PG_CASES!, 'utf8').replace(/^\uFEFF/, '')));
  for (const row of rows) assertMobileAnnouncementEditReceipt({ ...identity, userId: row.request.userId, teamId: row.request.teamId, memberId: row.request.memberId }, row.request, row.receipt);
  for (const action of ['create', 'edit', 'pin', 'delete']) expect(rows.some(row => row.request.action === action && row.receipt.status === 'applied')).toBe(true);
  for (const status of ['conflict', 'missing']) expect(rows.some(row => row.receipt.status === status)).toBe(true);
});
it('enforces matching owner/admin and action permissions while allowing raw empty drafts at the scope guard', () => {
  expect(() => assertAnnouncementEditScope(identity, { ...request, value: { ...request.value, title: '' } })).not.toThrow();
  for (const actor of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(90) }, { ...identity, memberId: id(90) }, { ...identity, role: 'pastor' }, { ...identity, permissions: ['announcements.create' as const] }, { ...identity, permissions: ['members.manage' as const] }]) expect(() => assertAnnouncementEditScope(actor, request)).toThrow();
});
it('restricts create audiences and preserves links/audience on content edit', () => {
  const create = { ...request, action: 'create', base: null, value: { ...request.value, isPinned: true, eventId: id(8), target: { kind: 'person', memberId: id(9) } } };
  expect(mobileAnnouncementEditRequestSchema.parse(create)).toEqual(create);
  expect(mobileAnnouncementEditRequestSchema.safeParse({ ...create, value: { ...create.value, target: { kind: 'person', profileId: id(9) } } }).success).toBe(false);
  for (const value of [{ ...request.value, eventId: id(9) }, { ...request.value, isPinned: true }, { ...request.value, target: { kind: 'all' } }, { ...request.value, title: ' ' }, { ...request.value, body: 'x'.repeat(3001) }]) expect(mobileAnnouncementEditRequestSchema.safeParse({ ...request, value }).success).toBe(false);
});
it('requires applied pin/delete invariants and honest conflict/missing results', () => {
  const pin = { ...request, action: 'pin' as const, isPinned: true }; const { value: _unused, ...pinRequest } = pin; void _unused;
  expect(assertMobileAnnouncementEditReceipt(identity, pinRequest, { ...receipt, request: pinRequest, current: { ...base, isPinned: true } }).status).toBe('applied');
  const remove = { ...request, action: 'delete' as const }; const { value: _value, ...deleteRequest } = remove; void _value;
  expect(assertMobileAnnouncementEditReceipt(identity, deleteRequest, { ...receipt, request: deleteRequest, current: null }).status).toBe('applied');
  expect(assertMobileAnnouncementEditReceipt(identity, request, { ...receipt, status: 'missing', current: null }).status).toBe('missing');
  expect(() => assertMobileAnnouncementEditReceipt(identity, request, { ...receipt, status: 'conflict', current: base })).toThrow();
  expect(assertMobileAnnouncementEditReceipt(identity, request, { ...receipt, status: 'conflict', current: { ...base, title: 'Website edit' } }).status).toBe('conflict');
});
