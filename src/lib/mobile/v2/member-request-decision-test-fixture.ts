import type { MobileIdentity } from '../contracts';
import type { MemberRequestDecisionBase, MobileMemberRequestDecisionRequest, MobileMemberRequestDecisionReceipt } from './member-request-decision';
export const memberRequestDecisionId = (n: number) => `99000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const memberRequestDecisionIdentity: MobileIdentity = { userId: memberRequestDecisionId(1), teamId: memberRequestDecisionId(2), memberId: memberRequestDecisionId(3), teamName: 'Team', role: 'admin', permissions: ['members.manage', 'join_requests.review'] };
export const memberRequestDecisionBase: MemberRequestDecisionBase = { profileId: memberRequestDecisionId(4), requestedRole: 'band_member', requestedAt: '2026-10-22T01:00:00Z', status: 'pending' };
export const memberRequestDecisionRequest: MobileMemberRequestDecisionRequest = { version: 2, userId: memberRequestDecisionIdentity.userId, teamId: memberRequestDecisionIdentity.teamId, memberId: memberRequestDecisionIdentity.memberId,
  requestNonce: memberRequestDecisionId(5), requestId: memberRequestDecisionId(6), base: memberRequestDecisionBase, decision: 'approved' };
export const memberRequestDecisionReceipt: MobileMemberRequestDecisionReceipt = { version: 2, request: memberRequestDecisionRequest, status: 'applied',
  current: { id: memberRequestDecisionRequest.requestId, teamId: memberRequestDecisionIdentity.teamId, ...memberRequestDecisionBase, status: 'approved', reviewedBy: memberRequestDecisionIdentity.userId, reviewedAt: '2026-10-22T02:00:00Z' },
  membership: { id: memberRequestDecisionId(7), teamId: memberRequestDecisionIdentity.teamId, profileId: memberRequestDecisionBase.profileId, role: memberRequestDecisionBase.requestedRole, status: 'active' }, reason: null, recordedAt: '2026-10-22T02:00:01Z' };
