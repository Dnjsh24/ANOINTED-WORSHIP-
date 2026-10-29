import { expect, it } from 'vitest';
import { assertMobileProfile, mobileProfileSchema } from './profile';
import { mobileProfileFixture as profile, profileTestId as id } from './profile-test-fixture';
it('retains own profile, selected membership and only a verified attendance rate', () => {
  expect(assertMobileProfile(profile.identity, profile)).toEqual(profile);
  const zero = { status: 'complete', availableCount: 0, responseCount: 0, rate: null, throughDate: '2026-10-21', reason: null };
  expect(mobileProfileSchema.safeParse({ ...profile, stats: { attendance: zero } }).success).toBe(true);
  expect(mobileProfileSchema.safeParse({ ...profile, stats: { attendance: { ...zero, rate: 100 } } }).success).toBe(false);
});
it('rejects substituted users/members/teams, changed authority and unexpected private fields', () => {
  for (const actor of [{ ...profile.identity, userId: id(90) }, { ...profile.identity, teamId: id(91) }, { ...profile.identity, memberId: id(92) },
    { ...profile.identity, role: 'admin' }, { ...profile.identity, permissions: ['members.manage' as const] }]) expect(() => assertMobileProfile(actor, profile)).toThrow();
  for (const change of [{ profile: { ...profile.profile, id: id(90) } }, { membership: { ...profile.membership, teamId: id(90) } }, { membership: { ...profile.membership, id: id(90) } },
    { profile: { ...profile.profile, accessToken: 'private' } }, { profile: { ...profile.profile, avatarUrl: 'javascript:alert(1)' } }]) expect(mobileProfileSchema.safeParse({ ...profile, ...change }).success).toBe(false);
});
it('keeps partial/unavailable attendance explicitly unknown and rejects fabricated rates', () => {
  const stats = profile.stats.attendance;
  for (const attendance of [{ ...stats, status: 'partial', rate: 67 }, { ...stats, status: 'unavailable', availableCount: null, responseCount: null, rate: 90 },
    { ...stats, availableCount: 4 }, { ...stats, rate: 90 }]) expect(mobileProfileSchema.safeParse({ ...profile, stats: { attendance } }).success).toBe(false);
  expect(mobileProfileSchema.safeParse({ ...profile, stats: { attendance: { ...stats, status: 'partial', rate: null, reason: 'Partial history' } } }).success).toBe(true);
});
