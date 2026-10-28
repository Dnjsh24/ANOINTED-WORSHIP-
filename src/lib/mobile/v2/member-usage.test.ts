import { expect, it } from 'vitest';
import { assertMobileMemberUsage, mobileMemberUsageSchema, mobileMemberUsageRequestSchema } from './member-usage';
import { memberUsageFixture as fixture, memberUsageIdentity as identity, memberUsageInput as input, memberUsageTestId as id } from './member-usage-test-fixture';
it('preserves website daily rows and UTC dates without invented history or counts', () => {
  expect(assertMobileMemberUsage(identity, input, fixture)).toEqual(fixture);
  expect(assertMobileMemberUsage(identity, input, { version: 2, identity, ...input, fetchedAt: fixture.fetchedAt, kind: 'unavailable', message: 'Migration not deployed.' }).kind).toBe('unavailable');
  expect(mobileMemberUsageSchema.safeParse({ ...fixture, lastSeenAt: 'now' }).success).toBe(false);
});
it('requires real ordered UTC dates of at most366days and exact returned range', () => {
  expect(mobileMemberUsageRequestSchema.safeParse({ start: '2025-01-01', end: '2026-01-01' }).success).toBe(true);
  for (const request of [{}, { start: '2026-02-30', end: '2026-03-01' }, { start: '2026-10-02', end: '2026-10-01' }, { start: '2025-01-01', end: '2026-01-02' }, { ...input, role: 'owner' }]) expect(mobileMemberUsageRequestSchema.safeParse(request).success).toBe(false);
  expect(() => assertMobileMemberUsage(identity, { ...input, end: '2026-10-08' }, fixture)).toThrow();
});
it('requires current owner/admin scope and exact permissions without delegated-member access', () => {
  for (const actor of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(90) }, { ...identity, memberId: id(90) }, { ...identity, role: 'member' }, { ...identity, permissions: [] }]) expect(() => assertMobileMemberUsage(actor, input, fixture)).toThrow();
});
it('rejects foreign scope, duplicate memberdays, malformed IDs, dates and invalid daily minute/session counts', () => {
  if (fixture.kind !== 'ready') throw new Error('Ready fixture required.'); const row = fixture.rows[0];
  for (const change of [{ team_id: id(90) }, { member_id: 'bad' }, { usage_date: '2026-10-08' }, { active_minutes: 1441 }, { active_minutes: 0.5 }, { sessions: -1 }, { sessions: 1441 }, { invented: true }]) expect(mobileMemberUsageSchema.safeParse({ ...fixture, rows: [{ ...row, ...change }] }).success).toBe(false);
  expect(mobileMemberUsageSchema.safeParse({ ...fixture, rows: [row, row] }).success).toBe(false);
  expect(mobileMemberUsageSchema.safeParse({ ...fixture, memberNames: { bad: 'Name' } }).success).toBe(false);
  expect(mobileMemberUsageSchema.safeParse({ ...fixture, memberNames: { [row.member_id]: '' } }).success).toBe(false);
  expect(mobileMemberUsageSchema.safeParse({ ...fixture, rows: Array.from({ length: 50001 }, () => row) }).success).toBe(false);
  expect(mobileMemberUsageSchema.safeParse({ ...fixture, kind: 'unavailable', message: 'Partial' }).success).toBe(false);
});
