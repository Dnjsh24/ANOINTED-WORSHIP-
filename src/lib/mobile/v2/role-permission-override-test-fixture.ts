import type { MobileIdentity } from '../contracts';
import type { MobileRolePermissionOverrideRequest, MobileRolePermissionOverrideReceipt, MobileRolePermissionOverrideState } from './role-permission-override';
export const rolePermissionOverrideId = (n: number) => `99830000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const rolePermissionOverrideIdentity: MobileIdentity = { userId: rolePermissionOverrideId(1), teamId: rolePermissionOverrideId(2), memberId: rolePermissionOverrideId(3), teamName: 'Team', role: 'owner', permissions: ['team.manage'] };
export const rolePermissionOverrideRequest: MobileRolePermissionOverrideRequest = { version: 2, userId: rolePermissionOverrideIdentity.userId, teamId: rolePermissionOverrideIdentity.teamId, memberId: rolePermissionOverrideIdentity.memberId,
  requestNonce: rolePermissionOverrideId(4), targetRole: 'admin', permission: 'members.manage',
  base: { id: rolePermissionOverrideId(5), teamId: rolePermissionOverrideIdentity.teamId, role: 'admin', permission: 'members.manage', allowed: true, createdAt: '2026-10-23T03:04:05.123456Z' }, value: 'deny' };
export const rolePermissionOverrideReceipt: MobileRolePermissionOverrideReceipt = { version: 2, request: rolePermissionOverrideRequest, status: 'applied',
  current: { id: rolePermissionOverrideId(6), teamId: rolePermissionOverrideIdentity.teamId, role: 'admin', permission: 'members.manage', allowed: false, createdAt: '2026-10-23T03:04:06.123456Z' }, recordedAt: '2026-10-23T03:04:07Z' };
export const rolePermissionOverrideState: MobileRolePermissionOverrideState = { version: 2, identity: rolePermissionOverrideIdentity, targetRole: 'admin', permission: 'members.manage', current: rolePermissionOverrideRequest.base, fetchedAt: '2026-10-23T03:04:07Z' };
