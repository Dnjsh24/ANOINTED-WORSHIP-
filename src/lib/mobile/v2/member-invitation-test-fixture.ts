import type { MobileIdentity } from '../contracts';
import type { MobileMemberInvitationRequest, MobileMemberInvitationReceipt } from './member-invitation';
export const memberInvitationId = (n: number) => `99100000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const memberInvitationIdentity: MobileIdentity = { userId: memberInvitationId(1), teamId: memberInvitationId(2), memberId: memberInvitationId(3), teamName: 'Team', role: 'admin', permissions: ['members.manage'] };
export const memberInvitationRequest: MobileMemberInvitationRequest = { version: 2, userId: memberInvitationIdentity.userId, teamId: memberInvitationIdentity.teamId, memberId: memberInvitationIdentity.memberId,
  requestNonce: memberInvitationId(4), email: 'new.member@example.test', role: 'member', message: 'Join our team.' };
export const memberInvitationReceipt: MobileMemberInvitationReceipt = { version: 2, request: memberInvitationRequest, status: 'applied', reason: null,
  current: { id: memberInvitationId(5), teamId: memberInvitationIdentity.teamId, email: memberInvitationRequest.email, role: 'member', message: memberInvitationRequest.message,
    invitedBy: memberInvitationIdentity.userId, status: 'pending', createdAt: '2026-10-22T01:00:00Z', updatedAt: '2026-10-22T01:00:00Z', expiresAt: null }, recordedAt: '2026-10-22T01:00:01Z' };
