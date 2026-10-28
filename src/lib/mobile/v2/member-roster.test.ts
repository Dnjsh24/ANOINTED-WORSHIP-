import { expect, it } from 'vitest';
import { assertMobileMemberRosterPage, assertMobileMemberRosterCache, mobileMemberRosterCacheSchema, mobileMemberRosterRequestSchema } from './member-roster';
import { memberRosterIdentity as identity, memberRosterItem as member, memberRosterPage as page, memberRosterCache as cache, rosterTestId as id } from './member-roster-test-fixture';
it('preserves only real roster fields with no remote avatar, fabricated statistics or administrative grants', () => {
  expect(assertMobileMemberRosterCache(identity, cache).items).toEqual([member]);
  for (const fields of [{ attendanceRate: 90 }, { lastActive: 'now' }, { avatarUrl: 'https://example.test/remote-avatar' }]) expect(mobileMemberRosterCacheSchema.safeParse({ ...cache, items: [{ ...member, ...fields }] }).success).toBe(false);
  expect(mobileMemberRosterCacheSchema.safeParse({ ...cache, canInvite: true }).success).toBe(false);
});
it('requires effective members.manage permission and exact actor/team/member/role/permission authority', () => {
  for (const actor of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(91) }, { ...identity, memberId: id(92) }, { ...identity, role: 'owner', permissions: [] },
    { ...identity, role: 'admin', permissions: [] }, { ...identity, permissions: [...identity.permissions, 'events.manage' as const] }]) expect(() => assertMobileMemberRosterCache(actor, cache)).toThrow();
  const delegate = { ...identity, role: 'member' }; expect(assertMobileMemberRosterCache(delegate, { ...cache, identity: delegate }).identity.role).toBe('member');
});
it('bounds pages/cache and rejects duplicate members or profiles rather than dropping rows', () => {
  expect(mobileMemberRosterCacheSchema.safeParse({ ...cache, items: [member, member] }).success).toBe(false);
  expect(mobileMemberRosterCacheSchema.safeParse({ ...cache, items: [member, { ...member, id: id(90) }] }).success).toBe(false);
  expect(mobileMemberRosterCacheSchema.safeParse({ ...cache, items: Array.from({ length: 5001 }, (_, n) => ({ ...member, id: id(n + 10), profileId: id(n + 10000) })) }).success).toBe(false);
  expect(() => assertMobileMemberRosterPage(identity, {}, { ...page, items: Array.from({ length: 101 }, (_, n) => ({ ...member, id: id(n + 10), profileId: id(n + 10000) })) })).toThrow();
});
it('pins keyset cursors to the original cutoff and returned last member', () => {
  expect(assertMobileMemberRosterPage(identity, {}, page)).toEqual(page);
  expect(mobileMemberRosterRequestSchema.safeParse({ after: id(4) }).success).toBe(false);
  for (const wrong of [{ ...page, nextCursor: { after: id(90), asOf: page.asOf } }, { ...page, items: [{ ...member, createdAt: '2027-01-01T00:00:00Z' }] },
    { ...page, items: [{ ...member, id: id(10) }, { ...member, id: id(9), profileId: id(90) }] }]) expect(() => assertMobileMemberRosterPage(identity, {}, wrong)).toThrow();
  expect(() => assertMobileMemberRosterPage(identity, { after: member.id, asOf: page.asOf }, page)).toThrow();
  expect(() => assertMobileMemberRosterPage(identity, { asOf: '2026-10-20T00:00:00Z' }, page)).toThrow();
});
