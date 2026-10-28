import { memberRoleAssignmentRequest, memberRoleAssignmentId } from './member-role-assignment-test-fixture';
import type { MobileIdentity } from '../contracts';
import type { MobileOwnershipTransferRequest, MobileOwnershipTransferReceipt, MobileOwnershipTransferResponse, MobileOwnershipTransferState } from './ownership-transfer';
export const ownershipTransferId = memberRoleAssignmentId;
export const ownershipTransferIdentity: MobileIdentity = { userId: ownershipTransferId(1), teamId: ownershipTransferId(2), memberId: ownershipTransferId(3), teamName: 'Team', role: 'owner', permissions: ['team.manage'] };
export const ownershipTransferRequest: MobileOwnershipTransferRequest = { version: 2, userId: ownershipTransferIdentity.userId, teamId: ownershipTransferIdentity.teamId, memberId: ownershipTransferIdentity.memberId, requestNonce: ownershipTransferId(4),
  base: { ownerId: ownershipTransferIdentity.userId, actor: { ...memberRoleAssignmentRequest.base, id: ownershipTransferIdentity.memberId, profileId: ownershipTransferIdentity.userId, role: 'owner' }, target: memberRoleAssignmentRequest.base } };
export const ownershipTransferReceipt: MobileOwnershipTransferReceipt = { version: 2, request: ownershipTransferRequest, status: 'applied', current: { ownerId: ownershipTransferRequest.base.target.profileId,
  actor: { ...ownershipTransferRequest.base.actor, role: 'admin', customRoleId: null }, target: { ...ownershipTransferRequest.base.target, role: 'owner', customRoleId: null } }, recordedAt: '2026-10-23T03:04:07Z' };
export const ownershipTransferCurrentIdentity: MobileIdentity = { ...ownershipTransferIdentity, role: 'admin', permissions: ['members.manage'] };
export const ownershipTransferResponse: MobileOwnershipTransferResponse = { version: 2, identity: ownershipTransferCurrentIdentity, receipt: ownershipTransferReceipt };
export const ownershipTransferState: MobileOwnershipTransferState = { version: 2, identity: ownershipTransferIdentity, targetMemberId: ownershipTransferRequest.base.target.id, requestNonce: null, current: ownershipTransferRequest.base, fetchedAt: '2026-10-23T03:04:07Z' };
