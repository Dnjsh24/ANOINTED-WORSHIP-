import { memberRoleAssignmentRequest, memberRoleAssignmentId } from './member-role-assignment-test-fixture';
import type { MobileIdentity } from '../contracts';
import type { MobileCustomRoleRetirementRequest, MobileCustomRoleRetirementReceipt, MobileCustomRoleRetirementState } from './custom-role-retirement';
export const customRoleRetirementId = memberRoleAssignmentId;
export const customRoleRetirementIdentity: MobileIdentity = { userId: customRoleRetirementId(1), teamId: customRoleRetirementId(2), memberId: customRoleRetirementId(3), teamName: 'Team', role: 'owner', permissions: ['team.manage', 'members.manage'] };
export const customRoleRetirementRequest: MobileCustomRoleRetirementRequest = { version: 2, userId: customRoleRetirementIdentity.userId, teamId: customRoleRetirementIdentity.teamId, memberId: customRoleRetirementIdentity.memberId,
  requestNonce: customRoleRetirementId(4), replacementRole: 'band_member', base: { role: { id: customRoleRetirementId(9), teamId: customRoleRetirementIdentity.teamId, name: '', permissions: ['team.manage', 'events.manage'], createdAt: '2026-10-23T03:04:05.123456Z' },
    members: [{ ...memberRoleAssignmentRequest.base, customRoleId: customRoleRetirementId(9) }] } };
export const customRoleRetirementReceipt: MobileCustomRoleRetirementReceipt = { version: 2, request: customRoleRetirementRequest, status: 'applied', current: null, reason: null, recordedAt: '2026-10-23T03:04:07Z' };
export const customRoleRetirementState: MobileCustomRoleRetirementState = { version: 2, identity: customRoleRetirementIdentity, roleId: customRoleRetirementRequest.base.role.id, current: customRoleRetirementRequest.base, assignedCount: 1, reason: null, fetchedAt: '2026-10-23T03:04:07Z' };
