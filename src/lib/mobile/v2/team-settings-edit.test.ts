import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { assertTeamSettingsEditScope, assertMobileTeamSettingsEditReceipt, mobileTeamSettingsEditRequestSchema, mobileTeamSettingsEditReceiptSchema } from './team-settings-edit';
import { teamSettingsEditIdentity as identity, teamSettingsEditRequest as request, teamSettingsEditReceipt as receipt, teamSettingsEditId as id } from './team-settings-edit-test-fixture';

it('requires current exact team-management scope without role-only or member-management grants', () => {
  expect(() => assertTeamSettingsEditScope(identity, request)).not.toThrow();
  for (const actor of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(90) }, { ...identity, memberId: id(90) }, { ...identity, role: 'owner', permissions: [] }, { ...identity, permissions: ['members.manage' as const] }]) expect(() => assertTeamSettingsEditScope(actor, request)).toThrow();
});
it('validates bounded real values and preserves full precision and existing unknown preferences', () => {
  for (const time of ['08:30', '08:30:15.123456', '24:00:00']) expect(mobileTeamSettingsEditRequestSchema.safeParse({ ...request, value: { ...request.value, defaultCallTime: time } }).success).toBe(true);
  for (const value of [{ ...request.value, teamName: ' x ' }, { ...request.value, defaultCallTime: '25:00' }, { ...request.value, defaultServiceLocation: '' }, { ...request.value, notificationPreferences: ['newUnknown'] }]) expect(mobileTeamSettingsEditRequestSchema.safeParse({ ...request, value }).success).toBe(false);
  const base = { ...request.base, settings: { ...request.base.settings!, notificationPreferences: ['futureOption', 'upcomingEvents', 'anotherFuture'] } };
  expect(mobileTeamSettingsEditRequestSchema.safeParse({ ...request, base, value: { ...request.value, notificationPreferences: ['futureOption', 'attendanceReminders', 'anotherFuture'] } }).success).toBe(true);
  for (const notificationPreferences of [[], ['anotherFuture', 'futureOption'], ['futureOption', 'anotherFuture', 'newFuture']]) expect(mobileTeamSettingsEditRequestSchema.safeParse({ ...request, base, value: { ...request.value, notificationPreferences } }).success).toBe(false);
});
it('binds applied receipts to immutable intent, exact values and preserved dashboard widgets', () => {
  expect(assertMobileTeamSettingsEditReceipt(identity, request, receipt)).toEqual(receipt);
  const settings = receipt.current.settings!;
  for (const result of [{ ...receipt, request: { ...request, requestNonce: id(90) } }, { ...receipt, current: { ...receipt.current, teamId: id(90) } },
    { ...receipt, current: { ...receipt.current, teamName: 'Wrong' } }, { ...receipt, current: { ...receipt.current, settings: null } },
    ...[{ defaultCallTime: '08:30:01' }, { dashboardWidgets: [] }, { notificationPreferences: [] }, { defaultServiceLocation: 'Wrong' }].map(change => ({ ...receipt, current: { ...receipt.current, settings: { ...settings, ...change } } }))]) expect(() => assertMobileTeamSettingsEditReceipt(identity, request, result)).toThrow();
  expect(assertMobileTeamSettingsEditReceipt(identity, request, { ...receipt, current: { ...receipt.current, settings: { ...settings, defaultCallTime: '08:30:00' } } })).toBeDefined();
});
it('keeps missing settings explicit and conflicts require a changed complete base', () => {
  expect(assertMobileTeamSettingsEditReceipt(identity, request, { ...receipt, status: 'missing', current: { ...receipt.current, settings: null } }).status).toBe('missing');
  expect(assertMobileTeamSettingsEditReceipt(identity, request, { ...receipt, status: 'conflict' }).status).toBe('conflict');
  expect(() => assertMobileTeamSettingsEditReceipt(identity, request, { ...receipt, status: 'conflict', current: { teamId: request.teamId, ...request.base } })).toThrow();
  expect(() => assertMobileTeamSettingsEditReceipt(identity, { ...request, base: { ...request.base, settings: null } }, { ...receipt, request: { ...request, base: { ...request.base, settings: null } } })).toThrow();
});
it.runIf(Boolean(process.env.MOBILE_TEAM_SETTINGS_EDIT_PG_CASES))('validates actualSQL applied/conflict/missing snapshots and exact receipts', () => {
  const rows = z.array(z.object({ request: mobileTeamSettingsEditRequestSchema, receipt: mobileTeamSettingsEditReceiptSchema }).strict()).min(5)
    .parse(JSON.parse(readFileSync(process.env.MOBILE_TEAM_SETTINGS_EDIT_PG_CASES!, 'utf8').replace(/^\uFEFF/, '')));
  for (const row of rows) assertMobileTeamSettingsEditReceipt({ ...identity, userId: row.request.userId, teamId: row.request.teamId, memberId: row.request.memberId }, row.request, row.receipt);
  for (const status of ['applied', 'conflict', 'missing']) expect(rows.some(row => row.receipt.status === status)).toBe(true);
});
