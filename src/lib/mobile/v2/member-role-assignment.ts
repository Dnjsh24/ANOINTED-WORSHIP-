import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';
import { mobileSettingsCustomRoleSchema } from './team-settings';
import { assertTeamNoticesIdentity } from './team-notices';

export const MOBILE_MEMBER_ROLE_ASSIGNMENT_MAX_BYTES = 32768;
export const memberRoleAssignmentSnapshotSchema = z.object({ id: z.uuid(), teamId: z.uuid(), profileId: z.uuid(), role: z.enum(teamRoles),
  status: z.enum(['active', 'inactive']), customRoleId: z.uuid().nullable(), createdAt: z.iso.datetime({ offset: true }),
}).strict();
export type MemberRoleAssignmentSnapshot = z.infer<typeof memberRoleAssignmentSnapshotSchema>;
export const mobileMemberRoleAssignmentRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  base: memberRoleAssignmentSnapshotSchema,
  value: z.object({ role: z.enum(teamRoles).exclude(['owner']), customRole: mobileSettingsCustomRoleSchema.nullable() }).strict(),
}).strict().refine(value => value.base.teamId === value.teamId && (!value.value.customRole || value.value.role === 'member' && value.value.customRole.teamId === value.teamId), 'Use the selected team and member role for a custom assignment.');
export type MobileMemberRoleAssignmentRequest = z.infer<typeof mobileMemberRoleAssignmentRequestSchema>;
const receiptFields = { version: z.literal(2), request: mobileMemberRoleAssignmentRequestSchema, recordedAt: z.iso.datetime({ offset: true }) };
export const mobileMemberRoleAssignmentReceiptSchema = z.discriminatedUnion('status', [
  z.object({ ...receiptFields, status: z.literal('applied'), current: memberRoleAssignmentSnapshotSchema, reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('missing'), current: z.null(), reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('conflict'), current: memberRoleAssignmentSnapshotSchema, reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('blocked'), current: memberRoleAssignmentSnapshotSchema, reason: z.enum(['custom_role_missing', 'custom_role_changed']) }).strict(),
]).refine(value => {
  if (value.current === null) return true;
  const base = value.request.base;
  if (value.current.id !== base.id || value.current.teamId !== base.teamId) return false;
  const same = JSON.stringify(value.current) === JSON.stringify(base);
  if (value.status === 'blocked') return same && value.request.value.customRole !== null;
  if (value.status === 'conflict') return !same;
  return JSON.stringify(value.current) === JSON.stringify({ ...base, role: value.request.value.role, customRoleId: value.request.value.customRole?.id ?? null });
}, 'The receipt must describe the exact selected member and assignment.');
export type MobileMemberRoleAssignmentReceipt = z.infer<typeof mobileMemberRoleAssignmentReceiptSchema>;
export const mobileMemberRoleStateSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, targetMemberId: z.uuid(),
  current: memberRoleAssignmentSnapshotSchema.nullable(), fetchedAt: z.iso.datetime({ offset: true }),
}).strict().refine(value => value.current === null || value.current.id === value.targetMemberId && value.current.teamId === value.identity.teamId, 'The current member state must match the selected target and team.');
export type MobileMemberRoleState = z.infer<typeof mobileMemberRoleStateSchema>;
export function assertMemberRoleAssignmentScope(identity: MobileIdentity, request: Pick<MobileMemberRoleAssignmentRequest, 'userId' | 'teamId' | 'memberId'> & { base?: MemberRoleAssignmentSnapshot } = identity) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId || !['owner', 'admin'].includes(identity.role) || !identity.permissions.includes('members.manage')
    || request.base && (request.base.teamId !== identity.teamId || request.base.id === identity.memberId || request.base.profileId === identity.userId || request.base.role === 'owner')) throw new Error('Current matching owner or admin with member-management authority may assign another non-owner member.');
}
export function assertMobileMemberRoleAssignmentReceipt(identity: MobileIdentity, request: MobileMemberRoleAssignmentRequest, value: unknown): MobileMemberRoleAssignmentReceipt {
  request = mobileMemberRoleAssignmentRequestSchema.parse(request); const result = mobileMemberRoleAssignmentReceiptSchema.parse(value); assertMemberRoleAssignmentScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request)) throw new Error('The receipt belongs to another immutable member role assignment.');
  return result;
}
export function assertMobileMemberRoleState(identity: MobileIdentity, targetMemberId: string, value: unknown): MobileMemberRoleState {
  const result = mobileMemberRoleStateSchema.parse(value); assertMemberRoleAssignmentScope(identity); assertTeamNoticesIdentity(identity, result.identity);
  if (result.targetMemberId !== targetMemberId) throw new Error('The member state belongs to another requested target.');
  return result;
}
