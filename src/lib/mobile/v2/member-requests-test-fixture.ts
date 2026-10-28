import type { MobileIdentity } from '../contracts';
import type { MobilePendingMemberRequest, MobileMemberRequestsPage, MobileMemberRequestsCache } from './member-requests';
export const requestTestId = (n: number) => `93000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = requestTestId;
export const memberRequestsIdentity: MobileIdentity = { userId: id(1), teamId: id(2), memberId: id(3), teamName: 'Team', role: 'admin', permissions: ['members.manage'] };
export const memberRequestsItem: MobilePendingMemberRequest = { id: id(4), profileId: id(5), fullName: 'Pending requester', email: 'member@example.test', avatarUrl: null,
  requestedRole: 'band_member', status: 'pending', requestedAt: '2025-01-01T00:00:00Z' };
export const memberRequestsPage: MobileMemberRequestsPage = { version: 2, identity: memberRequestsIdentity, items: [memberRequestsItem], asOf: '2026-10-21T04:00:00Z', fetchedAt: '2026-10-21T04:01:00Z',
  nextCursor: { after: memberRequestsItem.id, asOf: '2026-10-21T04:00:00Z' } };
export const memberRequestsCache: MobileMemberRequestsCache = { version: 2, identity: memberRequestsIdentity, items: [memberRequestsItem], fetchedAt: '2026-10-21T04:01:00Z' };
