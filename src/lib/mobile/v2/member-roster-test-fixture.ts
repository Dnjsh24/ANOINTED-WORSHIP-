import type { MobileIdentity } from '../contracts';
import type { MobileRosterMember, MobileMemberRosterPage, MobileMemberRosterCache } from './member-roster';
export const rosterTestId = (n: number) => `93000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = rosterTestId;
export const memberRosterIdentity: MobileIdentity = { userId: id(1), teamId: id(2), memberId: id(3), teamName: 'Team', role: 'admin', permissions: ['members.manage'] };
export const memberRosterItem: MobileRosterMember = { id: id(4), profileId: id(5), fullName: 'Real team member', email: 'member@example.test', avatarUrl: null,
  role: 'band_member', status: 'active', ministry: 'Band', ministries: ['Guitar'], createdAt: '2025-01-01T00:00:00Z' };
export const memberRosterPage: MobileMemberRosterPage = { version: 2, identity: memberRosterIdentity, items: [memberRosterItem], asOf: '2026-10-21T04:00:00Z', fetchedAt: '2026-10-21T04:01:00Z',
  nextCursor: { after: memberRosterItem.id, asOf: '2026-10-21T04:00:00Z' } };
export const memberRosterCache: MobileMemberRosterCache = { version: 2, identity: memberRosterIdentity, items: [memberRosterItem], fetchedAt: '2026-10-21T04:01:00Z' };
