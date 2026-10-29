import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { mobileIdentitySchema } from '../contracts';
import { assertReminderEditScope, assertMobileReminderEditReceipt, mobileReminderEditRequestSchema, mobileReminderEditReceiptSchema,
  assertMobileReminderManagementCache, assertMobileReminderManagementPage, mobileReminderManagementRequestSchema } from './reminder-edit';
import { reminderEditIdentity as identity, reminderEditId as id, reminderEditBase as base, reminderEditRequest as request, reminderEditReceipt as receipt, reminderManagementPage as page, reminderManagementCache as cache } from './reminder-edit-test-fixture';
it('binds exact immutable content intent, target and current wholegroup fields', () => {
  expect(assertMobileReminderEditReceipt(identity, request, receipt)).toEqual(receipt);
  for (const result of [{ ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, affectedCount: 1 }, { ...receipt, current: base },
    { ...receipt, current: { ...receipt.current, targetPath: '/dashboard' } }, { ...receipt, current: { ...receipt.current, rowCount: 1 } }]) expect(() => assertMobileReminderEditReceipt(identity, request, result)).toThrow();
});
it('requires current selectedowner/admin and members.manage but permits raw drafts at the scope guard', () => {
  const raw = { ...request, value: { title: '' } }; expect(() => assertReminderEditScope(identity, raw)).not.toThrow();
  for (const actor of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(90) }, { ...identity, memberId: id(90) }, { ...identity, role: 'pastor' }, { ...identity, permissions: [] }]) expect(() => assertReminderEditScope(actor, request)).toThrow();
});
it('limits mutable fields and rejects unsafe paths, unrepresentable dates/counts and legacy creation', () => {
  const create = { ...request, action: 'create', base: null, value: { title: 'Reminder', body: 'Body', priority: 'normal', eventId: null, targetPath: '/reminders', scheduledFor: '2027-01-31', recurrence: 'monthly', occurrences: 3, target: { kind: 'all' } } };
  expect(mobileReminderEditRequestSchema.parse(create)).toEqual(create);
  for (const change of [{ targetPath: 'https://attacker.test' }, { targetPath: '//attacker.test' }, { scheduledFor: '2027-02-30' }, { scheduledFor: '0000-01-01' }, { scheduledFor: '9999-12-31' }, { occurrences: 13 }, { body: 'x'.repeat(2001) }, { title: ' ' }]) expect(mobileReminderEditRequestSchema.safeParse({ ...create, value: { ...create.value, ...change } }).success).toBe(false);
  expect(mobileReminderEditRequestSchema.safeParse({ ...create, target: { ...create.target, kind: 'legacy' } }).success).toBe(false);
  for (const change of [{ targetPath: '/dashboard' }, { recurrence: 'none' }, { isPinned: true }]) expect(mobileReminderEditRequestSchema.safeParse({ ...request, value: { ...request.value, ...change } }).success).toBe(false);
});
it('validates shared Manila monthclamp schedules, rejecting shifted first/last dates and false creationcounts', () => {
  const create = mobileReminderEditRequestSchema.parse({ ...request, action: 'create', base: null, value: { title: 'Reminder', body: 'Body', priority: 'normal', eventId: null, targetPath: '/reminders', scheduledFor: '2027-01-31', recurrence: 'monthly', occurrences: 3, target: { kind: 'all' } } });
  const current = { ...base, title: 'Reminder', body: 'Body', priority: 'normal', firstScheduledFor: '2027-01-30T16:00:00Z', lastScheduledFor: '2027-03-30T16:00:00Z', recurrenceRule: 'monthly', occurrences: 3, recipientCount: 2, rowCount: 6 };
  const result = { ...receipt, request: create, current };
  expect(assertMobileReminderEditReceipt(identity, create, result).status).toBe('applied');
  for (const change of [{ firstScheduledFor: '2027-01-31T00:00:00Z' }, { lastScheduledFor: '2027-03-31T16:00:00Z' }, { recipientCount: 3 }, { occurrences: 2 }]) expect(() => assertMobileReminderEditReceipt(identity, create, { ...result, current: { ...current, ...change } })).toThrow();
});
it('distinguishes wholegroup deletion, missing and fingerprintconflict without acceptingpartialwrites', () => {
  const remove = mobileReminderEditRequestSchema.parse({ version: 2, userId: identity.userId, teamId: identity.teamId, memberId: identity.memberId, requestNonce: id(90), target: request.target, action: 'delete', base });
  expect(assertMobileReminderEditReceipt(identity, remove, { ...receipt, request: remove, current: null }).status).toBe('applied');
  expect(() => assertMobileReminderEditReceipt(identity, remove, { ...receipt, request: remove, current: null, affectedCount: 1 })).toThrow();
  expect(assertMobileReminderEditReceipt(identity, request, { ...receipt, status: 'missing', current: null, affectedCount: 0 }).status).toBe('missing');
  expect(assertMobileReminderEditReceipt(identity, request, { ...receipt, status: 'conflict', current: { ...base, fingerprint: 'c'.repeat(64) }, affectedCount: 0 }).status).toBe('conflict');
  expect(() => assertMobileReminderEditReceipt(identity, request, { ...receipt, status: 'conflict', current: base, affectedCount: 0 })).toThrow();
});
it('confirms an exact no-op with zero writes and unchanged fingerprint, never a fabricated whole-group rewrite', () => {
  const unchanged = { ...request, value: { title: base.title, body: base.body!, priority: base.priority } };
  expect(assertMobileReminderEditReceipt(identity, unchanged, { ...receipt, request: unchanged, current: base, affectedCount: 0 }).affectedCount).toBe(0);
  expect(() => assertMobileReminderEditReceipt(identity, unchanged, { ...receipt, request: unchanged, current: base, affectedCount: base.rowCount })).toThrow();
});
it('retains full futuregroup and legacyindividual summaries with exact current scope and complete bound cursors', () => {
  expect(assertMobileReminderManagementPage(identity, {}, page)).toEqual(page);
  expect(assertMobileReminderManagementCache(identity, { ...cache, items: [{ ...base, kind: 'legacy', rowCount: 1, occurrences: 1, recipientCount: 1, body: null, targetPath: 'https://legacy.example.test/retained' }] }).items[0].body).toBeNull();
  expect(mobileReminderManagementRequestSchema.safeParse({ after: `group:${id(4)}` }).success).toBe(false);
  for (const wrong of [{ ...page, items: [base, base] }, { ...page, nextCursor: { after: `group:${id(90)}`, asOf: page.asOf } }, { ...page, items: [{ ...base, createdAt: '2030-01-01T00:00:00Z' }] }]) expect(() => assertMobileReminderManagementPage(identity, {}, wrong)).toThrow();
  expect(() => assertMobileReminderManagementCache({ ...identity, permissions: [] }, cache)).toThrow();
});
it.runIf(Boolean(process.env.MOBILE_REMINDER_EDIT_PG_CASES))('validates actual persistedSQL receipts and managerpages with SDK schemas', () => {
  const rows = z.array(z.object({ request: mobileReminderEditRequestSchema, receipt: mobileReminderEditReceiptSchema }).strict()).min(10)
    .parse(JSON.parse(readFileSync(process.env.MOBILE_REMINDER_EDIT_PG_CASES!, 'utf8').replace(/^\uFEFF/, '')));
  for (const row of rows) assertMobileReminderEditReceipt({ ...identity, userId: row.request.userId, teamId: row.request.teamId, memberId: row.request.memberId }, row.request, row.receipt);
  const pages = z.array(z.object({ identity: mobileIdentitySchema, page: z.record(z.string(), z.unknown()) })).min(1)
    .parse(JSON.parse(readFileSync(process.env.MOBILE_REMINDER_MANAGEMENT_PG_PAGES!, 'utf8').replace(/^\uFEFF/, '')));
  for (const item of pages) assertMobileReminderManagementPage(item.identity, {}, { ...item.page, version: 2, identity: item.identity });
});
