import { customRoleCreateIdentity, customRoleCreateId } from './custom-role-create-test-fixture';
import type { MobileCustomRoleDeleteRequest, MobileCustomRoleDeleteReceipt } from './custom-role-delete';
export const customRoleDeleteId = customRoleCreateId;
export const customRoleDeleteIdentity = customRoleCreateIdentity;
export const customRoleDeleteRequest: MobileCustomRoleDeleteRequest = { version: 2, userId: customRoleDeleteIdentity.userId, teamId: customRoleDeleteIdentity.teamId, memberId: customRoleDeleteIdentity.memberId,
  requestNonce: customRoleDeleteId(4), base: { id: customRoleDeleteId(5), teamId: customRoleDeleteIdentity.teamId, name: '', permissions: ['team.manage', 'events.manage'], createdAt: null } };
export const customRoleDeleteReceipt: MobileCustomRoleDeleteReceipt = { version: 2, request: customRoleDeleteRequest, status: 'applied', reason: null, current: null, recordedAt: '2026-10-22T01:00:01Z' };
