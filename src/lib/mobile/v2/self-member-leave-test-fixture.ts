import type { MobileSelfMemberLeaveRequest, MobileSelfMemberLeaveReceipt, MobileSelfMemberLeaveState } from './self-member-leave';
export const selfMemberLeaveId = (value: number) => `99880000-0000-4000-8000-${String(value).padStart(12, '0')}`;
export const selfMemberLeaveScope = { userId: selfMemberLeaveId(1), teamId: selfMemberLeaveId(2), memberId: selfMemberLeaveId(3) };
export const selfMemberLeaveRequest: MobileSelfMemberLeaveRequest = { version: 2, ...selfMemberLeaveScope, requestNonce: selfMemberLeaveId(4), confirmation: 'LEAVE TEAM',
  base: { ownerId: selfMemberLeaveId(5), member: { id: selfMemberLeaveScope.memberId, teamId: selfMemberLeaveScope.teamId, profileId: selfMemberLeaveScope.userId,
    role: 'member', status: 'active', customRoleId: null, createdAt: '2026-10-23T03:04:05.123456Z' } } };
export const selfMemberLeaveReceipt: MobileSelfMemberLeaveReceipt = { version: 2, request: selfMemberLeaveRequest, status: 'applied', current: null, reason: null, recordedAt: '2026-10-23T04:00:00Z' };
export const selfMemberLeaveState: MobileSelfMemberLeaveState = { version: 2, ...selfMemberLeaveScope, requestNonce: null, current: selfMemberLeaveRequest.base, fetchedAt: '2026-10-23T04:00:00Z' };
