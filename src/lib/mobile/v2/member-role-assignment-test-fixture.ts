import type { MobileIdentity } from '../contracts';
import type { MobileMemberRoleAssignmentRequest, MobileMemberRoleAssignmentReceipt, MobileMemberRoleState } from './member-role-assignment';
export const memberRoleAssignmentId = (n: number) => `99800000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const memberRoleAssignmentIdentity: MobileIdentity = { userId: memberRoleAssignmentId(1), teamId: memberRoleAssignmentId(2), memberId: memberRoleAssignmentId(3), teamName: 'Team', role: 'owner', permissions: ['members.manage'] };
export const memberRoleAssignmentRequest: MobileMemberRoleAssignmentRequest = { version: 2, userId: memberRoleAssignmentIdentity.userId, teamId: memberRoleAssignmentIdentity.teamId, memberId: memberRoleAssignmentIdentity.memberId,
  requestNonce: memberRoleAssignmentId(4), base: { id: memberRoleAssignmentId(5), teamId: memberRoleAssignmentIdentity.teamId, profileId: memberRoleAssignmentId(6), role: 'member', status: 'active', customRoleId: null, createdAt: '2026-10-23T01:00:00.123456Z' },
  value: { role: 'band_leader', customRole: null } };
export const memberRoleAssignmentReceipt: MobileMemberRoleAssignmentReceipt = { version: 2, request: memberRoleAssignmentRequest, status: 'applied', reason: null,
  current: { ...memberRoleAssignmentRequest.base, role: memberRoleAssignmentRequest.value.role }, recordedAt: '2026-10-23T01:00:01Z' };
export const memberRoleAssignmentState: MobileMemberRoleState = { version: 2, identity: memberRoleAssignmentIdentity, targetMemberId: memberRoleAssignmentRequest.base.id, current: memberRoleAssignmentRequest.base, fetchedAt: '2026-10-23T01:00:01Z' };
