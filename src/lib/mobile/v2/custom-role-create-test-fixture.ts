import type { MobileIdentity } from '../contracts';
import type { MobileCustomRoleCreateRequest, MobileCustomRoleCreateReceipt } from './custom-role-create';
export const customRoleCreateId = (n: number) => `99500000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const customRoleCreateIdentity: MobileIdentity = { userId: customRoleCreateId(1), teamId: customRoleCreateId(2), memberId: customRoleCreateId(3), teamName: 'Team', role: 'owner', permissions: ['team.manage'] };
export const customRoleCreateRequest: MobileCustomRoleCreateRequest = { version: 2, userId: customRoleCreateIdentity.userId, teamId: customRoleCreateIdentity.teamId, memberId: customRoleCreateIdentity.memberId,
  requestNonce: customRoleCreateId(4), name: 'Rehearsal coordinator', permissions: ['events.manage', 'setlists.manage'] };
export const customRoleCreateReceipt: MobileCustomRoleCreateReceipt = { version: 2, request: customRoleCreateRequest, status: 'applied', reason: null,
  current: { id: customRoleCreateId(5), teamId: customRoleCreateIdentity.teamId, name: customRoleCreateRequest.name, permissions: customRoleCreateRequest.permissions, createdAt: '2026-10-22T01:00:00Z' }, recordedAt: '2026-10-22T01:00:01Z' };
