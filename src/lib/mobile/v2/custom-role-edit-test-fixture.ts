import { customRoleCreateIdentity, customRoleCreateId } from './custom-role-create-test-fixture';
import type { MobileCustomRoleEditRequest, MobileCustomRoleEditReceipt } from './custom-role-edit';
export const customRoleEditId = customRoleCreateId;
export const customRoleEditIdentity = customRoleCreateIdentity;
export const customRoleEditRequest: MobileCustomRoleEditRequest = { version: 2, userId: customRoleEditIdentity.userId, teamId: customRoleEditIdentity.teamId, memberId: customRoleEditIdentity.memberId,
  requestNonce: customRoleEditId(4), base: { id: customRoleEditId(5), teamId: customRoleEditIdentity.teamId, name: '', permissions: ['team.manage', 'events.manage'], createdAt: null }, value: { name: 'Updated coordinator', permissions: ['events.manage', 'team.manage'] } };
export const customRoleEditReceipt: MobileCustomRoleEditReceipt = { version: 2, request: customRoleEditRequest, status: 'applied', reason: null, current: { ...customRoleEditRequest.base, ...customRoleEditRequest.value }, recordedAt: '2026-10-22T01:00:01Z' };
