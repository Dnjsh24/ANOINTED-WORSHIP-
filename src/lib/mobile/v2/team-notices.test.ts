import { expect, it } from 'vitest';
import { assertMobileTeamNoticesCache, assertMobileTeamNoticesPage, mobileTeamNoticesCacheSchema, mobileReminderSchema } from './team-notices';
import { teamAnnouncement, teamNoticeIdentity as identity, teamNoticeId as id, teamNoticesCache as cache, teamNoticesPage as page, teamReminder } from './team-notices-test-fixture';
it('preserves full notice bodies, targeting, own acknowledgement and recurring reminder fields', () => {
  expect(assertMobileTeamNoticesCache(identity, cache).items[0]).toEqual(teamAnnouncement);
  expect(mobileReminderSchema.parse(teamReminder)).toEqual(teamReminder);
  expect(mobileReminderSchema.safeParse({ ...teamReminder, recurrenceIndex: 4 }).success).toBe(false);
});
it('rejects foreign/stale cache authority and invented mutation permissions', () => {
  for (const actor of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(91) }, { ...identity, memberId: id(92) }, { ...identity, role: 'admin' as const }, { ...identity, permissions: ['members.manage' as const] }]) expect(() => assertMobileTeamNoticesCache(actor, cache)).toThrow();
  expect(mobileTeamNoticesCacheSchema.safeParse({ ...cache, canManage: true }).success).toBe(false);
  expect(mobileTeamNoticesCacheSchema.safeParse({ ...cache, items: [teamAnnouncement, teamAnnouncement] }).success).toBe(false);
});
it('requires exact kind, stable cutoff, advancing IDs and cursor bound to the returned last row', () => {
  expect(assertMobileTeamNoticesPage(identity, { kind: 'announcements' }, page)).toEqual(page);
  for (const wrong of [{ ...page, kind: 'reminders' }, { ...page, nextCursor: { ...page.nextCursor, after: id(99) } }, { ...page, items: [teamAnnouncement, teamAnnouncement] }]) expect(() => assertMobileTeamNoticesPage(identity, { kind: 'announcements' }, wrong)).toThrow();
  expect(() => assertMobileTeamNoticesPage(identity, { kind: 'announcements', after: id(4) }, page)).toThrow();
  expect(() => assertMobileTeamNoticesPage(identity, { kind: 'announcements', asOf: '2026-10-20T04:00:00Z' }, page)).toThrow();
});
it('bounds each page and the retained cache without silently dropping notices', () => {
  expect(() => assertMobileTeamNoticesPage(identity, { kind: 'announcements' }, { ...page, items: Array.from({ length: 101 }, (_, index) => ({ ...teamAnnouncement, id: id(index + 10) })) })).toThrow();
  expect(mobileTeamNoticesCacheSchema.safeParse({ ...cache, items: Array.from({ length: 5001 }, (_, index) => ({ ...teamAnnouncement, id: id(index + 10) })) }).success).toBe(false);
});
it('retains the website person-label email fallback through254characters', () => {
  expect(assertMobileTeamNoticesCache(identity, { ...cache, items: [{ ...teamAnnouncement, targetLabel: 'a'.repeat(254) }] }).items[0].targetLabel).toHaveLength(254);
  expect(mobileTeamNoticesCacheSchema.safeParse({ ...cache, items: [{ ...teamAnnouncement, targetLabel: 'a'.repeat(255) }] }).success).toBe(false);
});
