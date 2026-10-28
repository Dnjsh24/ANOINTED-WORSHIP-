import type { MobileProfile } from './profile';
export const profileTestId = (n: number) => `95000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = profileTestId;
export const mobileProfileFixture: MobileProfile = { version: 2, identity: { userId: id(1), teamId: id(2), memberId: id(3), teamName: 'Team', role: 'band_member', permissions: [] },
  profile: { id: id(1), fullName: 'Worship member', email: 'member@example.test', avatarUrl: null, birthday: '1990-05-10' },
  membership: { id: id(3), teamId: id(2), userId: id(1), role: 'band_member', ministries: ['Guitar'], createdAt: '2025-01-01T00:00:00Z', teamAnniversary: '2025-01-01', status: 'active' },
  stats: { attendance: { status: 'complete', availableCount: 2, responseCount: 3, rate: 67, throughDate: '2026-10-21', reason: null } }, fetchedAt: '2026-10-21T05:00:00Z' };
