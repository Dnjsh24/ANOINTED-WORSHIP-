import { memberRoleAssignmentIdentity, memberRoleAssignmentId, memberRoleAssignmentRequest } from './member-role-assignment-test-fixture';
import type { MobileMemberRemovalRequest, MobileMemberRemovalReceipt } from './member-removal';
export const memberRemovalId = memberRoleAssignmentId;
export const memberRemovalIdentity = memberRoleAssignmentIdentity;
export const memberRemovalRequest: MobileMemberRemovalRequest = { version: 2, userId: memberRemovalIdentity.userId, teamId: memberRemovalIdentity.teamId,
  memberId: memberRemovalIdentity.memberId, requestNonce: memberRemovalId(4), base: memberRoleAssignmentRequest.base };
export const memberRemovalReceipt: MobileMemberRemovalReceipt = { version: 2, request: memberRemovalRequest, status: 'applied', current: null, reason: null, recordedAt: '2026-10-23T01:00:01Z' };
export { memberRoleAssignmentState as memberRemovalState } from './member-role-assignment-test-fixture';
