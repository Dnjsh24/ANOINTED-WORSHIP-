import { expect, it } from 'vitest';
import { assertMobileMemberRequestsPage, assertMobileMemberRequestsCache, mobileMemberRequestsCacheSchema, mobileMemberRequestsRequestSchema } from './member-requests';
import { memberRequestsIdentity as identity, memberRequestsItem as member, memberRequestsPage as page, memberRequestsCache as cache, requestTestId as id } from './member-requests-test-fixture';
it('preserves only pending requester fields with no fabricated ministries, remote avatar or administrative grants', () => {
  expect(assertMobileMemberRequestsCache(identity, cache).items).toEqual([member]);
  for (const fields of [{ attendanceRate: 90 }, { lastActive: 'now' }, { ministries: ['Unknown'] }, { status: 'approved' }, { avatarUrl: 'https://example.test/remote-avatar' }]) expect(mobileMemberRequestsCacheSchema.safeParse({ ...cache, items: [{ ...member, ...fields }] }).success).toBe(false);
  expect(mobileMemberRequestsCacheSchema.safeParse({ ...cache, canInvite: true }).success).toBe(false);
});
it('requires effective members.manage permission and exact actor/team/member/role/permission authority', () => {
  for (const actor of [{ ...identity, userId: id(90) }, { ...identity, teamId: id(91) }, { ...identity, memberId: id(92) }, { ...identity, role: 'owner', permissions: [] },
    { ...identity, role: 'admin', permissions: [] }, { ...identity, permissions: [...identity.permissions, 'events.manage' as const] }]) expect(() => assertMobileMemberRequestsCache(actor, cache)).toThrow();
  const delegate = { ...identity, role: 'member' }; expect(assertMobileMemberRequestsCache(delegate, { ...cache, identity: delegate }).identity.role).toBe('member');
});
it('bounds pages/cache and rejects duplicate members or profiles rather than dropping rows', () => {
  expect(mobileMemberRequestsCacheSchema.safeParse({ ...cache, items: [member, member] }).success).toBe(false);
  expect(mobileMemberRequestsCacheSchema.safeParse({ ...cache, items: [member, { ...member, id: id(90) }] }).success).toBe(false);
  expect(mobileMemberRequestsCacheSchema.safeParse({ ...cache, items: Array.from({ length: 5001 }, (_, n) => ({ ...member, id: id(n + 10), profileId: id(n + 10000) })) }).success).toBe(false);
  expect(() => assertMobileMemberRequestsPage(identity, {}, { ...page, items: Array.from({ length: 101 }, (_, n) => ({ ...member, id: id(n + 10), profileId: id(n + 10000) })) })).toThrow();
});
it('pins keyset cursors to the original cutoff and returned last member', () => {
  expect(assertMobileMemberRequestsPage(identity, {}, page)).toEqual(page);
  expect(mobileMemberRequestsRequestSchema.safeParse({ after: id(4) }).success).toBe(false);
  for (const wrong of [{ ...page, nextCursor: { after: id(90), asOf: page.asOf } }, { ...page, items: [{ ...member, requestedAt: '2027-01-01T00:00:00Z' }] },
    { ...page, items: [{ ...member, id: id(10) }, { ...member, id: id(9), profileId: id(90) }] }]) expect(() => assertMobileMemberRequestsPage(identity, {}, wrong)).toThrow();
  expect(() => assertMobileMemberRequestsPage(identity, { after: member.id, asOf: page.asOf }, page)).toThrow();
  expect(() => assertMobileMemberRequestsPage(identity, { asOf: '2026-10-20T00:00:00Z' }, page)).toThrow();
});
