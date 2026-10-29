import { memberRoleAssignmentRequest } from './member-role-assignment-test-fixture';
import { rolePermissionOverrideIdentity, rolePermissionOverrideId } from './role-permission-override-test-fixture';
import type { MobilePersonPermissionOverrideRequest, MobilePersonPermissionOverrideReceipt, MobilePersonPermissionOverrideState } from './person-permission-override';
export const personPermissionOverrideId = rolePermissionOverrideId;
export const personPermissionOverrideIdentity = rolePermissionOverrideIdentity;
export const personPermissionOverrideRequest: MobilePersonPermissionOverrideRequest = { version: 2, userId: rolePermissionOverrideIdentity.userId, teamId: rolePermissionOverrideIdentity.teamId, memberId: rolePermissionOverrideIdentity.memberId,
  requestNonce: personPermissionOverrideId(4), permission: 'events.manage', value: 'deny',
  base: { member: { ...memberRoleAssignmentRequest.base, teamId: rolePermissionOverrideIdentity.teamId }, override: null } };
export const personPermissionOverrideReceipt: MobilePersonPermissionOverrideReceipt = { version: 2, request: personPermissionOverrideRequest, status: 'applied',
  current: { member: personPermissionOverrideRequest.base.member, override: { id: personPermissionOverrideId(6), teamId: rolePermissionOverrideIdentity.teamId, memberId: personPermissionOverrideRequest.base.member.id, permission: 'events.manage', allowed: false, createdAt: '2026-10-23T03:04:06.123456Z' } }, recordedAt: '2026-10-23T03:04:07Z' };
export const personPermissionOverrideState: MobilePersonPermissionOverrideState = { version: 2, identity: personPermissionOverrideIdentity, targetMemberId: personPermissionOverrideRequest.base.member.id, permission: 'events.manage', current: personPermissionOverrideRequest.base, fetchedAt: '2026-10-23T03:04:07Z' };
