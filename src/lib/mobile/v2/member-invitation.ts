import { z } from 'zod';
import type { MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';

export const MOBILE_MEMBER_INVITATION_MAX_BYTES = 32768;
const time = z.iso.datetime({ offset: true });
export const mobileMemberInvitationRequestSchema = z.object({
  version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  email: z.email().max(254).refine(value => value === value.trim().toLowerCase(), 'Use the canonical lowercase email.'),
  role: z.enum(teamRoles), message: z.string().min(1).max(1000).refine(value => value === value.trim()).nullable(),
}).strict();
export type MobileMemberInvitationRequest = z.infer<typeof mobileMemberInvitationRequestSchema>;
const invitation = z.object({ id: z.uuid(), teamId: z.uuid(), email: z.email().max(254), role: z.enum(teamRoles),
  message: z.string().max(1000).nullable(), status: z.enum(['pending', 'accepted', 'revoked']), invitedBy: z.uuid(),
  createdAt: time, updatedAt: time, expiresAt: z.null(),
}).strict();
export const mobileMemberInvitationReceiptSchema = z.object({ version: z.literal(2), request: mobileMemberInvitationRequestSchema,
  status: z.enum(['applied', 'blocked']), current: invitation.nullable(),
  reason: z.enum(['existing_invitation', 'existing_membership', 'privileged_role']).nullable(), recordedAt: time,
}).strict();
export type MobileMemberInvitationReceipt = z.infer<typeof mobileMemberInvitationReceiptSchema>;
export function assertMemberInvitationScope(identity: MobileIdentity, request: Pick<MobileMemberInvitationRequest, 'userId' | 'teamId' | 'memberId' | 'role'>) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId
    || !identity.permissions.includes('members.manage') || request.role !== 'member' && !['owner', 'admin'].includes(identity.role)) {
    throw new Error('Current matching member-management and role-assignment authority is required.');
  }
}
export function assertMobileMemberInvitationReceipt(identity: MobileIdentity, request: MobileMemberInvitationRequest, value: unknown): MobileMemberInvitationReceipt {
  request = mobileMemberInvitationRequestSchema.parse(request);
  const result = mobileMemberInvitationReceiptSchema.parse(value); assertMemberInvitationScope(identity, request);
  if (Object.keys(request).some(key => request[key as keyof typeof request] !== result.request[key as keyof typeof request])) throw new Error('The receipt belongs to another immutable invitation.');
  const row = result.current;
  if (row && (row.teamId !== request.teamId || row.email.trim().toLowerCase() !== request.email)) throw new Error('Invitation receipt target scope changed.');
  if (result.status === 'applied') {
    if (result.reason !== null || !row || row.email !== request.email || row.role !== request.role || row.message !== request.message
      || row.status !== 'pending' || row.invitedBy !== identity.userId || ['owner', 'admin'].includes(request.role)
      || Date.parse(row.createdAt) !== Date.parse(row.updatedAt) || Date.parse(row.createdAt) > Date.parse(result.recordedAt)) throw new Error('The exact saved pending invitation was not confirmed.');
  } else if (!result.reason || (result.reason === 'privileged_role' ? !['owner', 'admin'].includes(request.role) || row !== null
    : result.reason === 'existing_membership' ? row !== null : false)) throw new Error('Blocked invitations require an unchanged bounded reason.');
  return result;
}
