import { z } from 'zod';
import { mobileIdentitySchema, type MobileIdentity } from '../contracts';
import { teamRoles } from '../../types';
import { mobileSettingsCustomRoleSchema } from './team-settings';
import { memberRoleAssignmentSnapshotSchema } from './member-role-assignment';
import { assertRolePermissionOverrideScope } from './role-permission-override';
import { assertTeamNoticesIdentity } from './team-notices';
export const MOBILE_CUSTOM_ROLE_RETIREMENT_MAX_MEMBERS = 100;
export const MOBILE_CUSTOM_ROLE_RETIREMENT_MAX_BYTES = 131072;
export const mobileCustomRoleRetirementSelectionSchema = z.object({ role: mobileSettingsCustomRoleSchema,
  members: z.array(memberRoleAssignmentSnapshotSchema).max(MOBILE_CUSTOM_ROLE_RETIREMENT_MAX_MEMBERS),
}).strict().refine(value => value.members.every((member, index) => member.teamId === value.role.teamId && member.customRoleId === value.role.id && (index === 0 || member.id > value.members[index - 1].id)), 'Use the complete strictly ordered unique assignments for the exact role.');
export type MobileCustomRoleRetirementSelection = z.infer<typeof mobileCustomRoleRetirementSelectionSchema>;
export const mobileCustomRoleRetirementRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  base: mobileCustomRoleRetirementSelectionSchema, replacementRole: z.enum(teamRoles).exclude(['owner']),
}).strict().refine(value => value.base.role.teamId === value.teamId, 'The selected role must belong to this team.');
export type MobileCustomRoleRetirementRequest = z.infer<typeof mobileCustomRoleRetirementRequestSchema>;
const receiptFields = { version: z.literal(2), request: mobileCustomRoleRetirementRequestSchema, recordedAt: z.iso.datetime({ offset: true }) };
export const mobileCustomRoleRetirementReceiptSchema = z.discriminatedUnion('status', [
  z.object({ ...receiptFields, status: z.literal('applied'), current: z.null(), reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('missing'), current: z.null(), reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('conflict'), current: mobileCustomRoleRetirementSelectionSchema, reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('blocked'), current: mobileCustomRoleRetirementSelectionSchema.nullable(), reason: z.enum(['protected_member', 'member_limit']) }).strict(),
]).refine(value => {
  if (value.status === 'applied' || value.status === 'missing') return true;
  if (value.status === 'blocked' && value.reason === 'member_limit') return value.current === null;
  if (!value.current || value.current.role.id !== value.request.base.role.id || value.current.role.teamId !== value.request.teamId) return false;
  const same = JSON.stringify(value.current) === JSON.stringify(value.request.base);
  return value.status === 'conflict' ? !same : same && value.current.members.some(member => member.role === 'owner' || member.id === value.request.memberId || member.profileId === value.request.userId);
}, 'The receipt must describe the exact retirement target and outcome.');
export type MobileCustomRoleRetirementReceipt = z.infer<typeof mobileCustomRoleRetirementReceiptSchema>;
export const mobileCustomRoleRetirementStateSchema = z.object({ version: z.literal(2), identity: mobileIdentitySchema, roleId: z.uuid(),
  current: mobileCustomRoleRetirementSelectionSchema.nullable(), assignedCount: z.number().int().nonnegative(), reason: z.literal('member_limit').nullable(), fetchedAt: z.iso.datetime({ offset: true }),
}).strict().refine(value => value.reason === 'member_limit' ? value.current === null && value.assignedCount > MOBILE_CUSTOM_ROLE_RETIREMENT_MAX_MEMBERS
  : value.current === null ? value.assignedCount === 0 : value.current.role.id === value.roleId && value.current.role.teamId === value.identity.teamId && value.assignedCount === value.current.members.length, 'The complete bounded assignment catalog must match the selected role.');
export type MobileCustomRoleRetirementState = z.infer<typeof mobileCustomRoleRetirementStateSchema>;
export function assertCustomRoleRetirementScope(identity: MobileIdentity, request?: Pick<MobileCustomRoleRetirementRequest, 'userId' | 'teamId' | 'memberId'>) {
  assertRolePermissionOverrideScope(identity, request);
  if (!identity.permissions.includes('members.manage')) throw new Error('Current owner with team-management and member-management authority is required.');
}
export function assertMobileCustomRoleRetirementReceipt(identity: MobileIdentity, request: MobileCustomRoleRetirementRequest, value: unknown): MobileCustomRoleRetirementReceipt {
  request = mobileCustomRoleRetirementRequestSchema.parse(request); const result = mobileCustomRoleRetirementReceiptSchema.parse(value); assertCustomRoleRetirementScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request)) throw new Error('The receipt belongs to another immutable role retirement.');
  return result;
}
export function assertMobileCustomRoleRetirementState(identity: MobileIdentity, roleId: string, value: unknown): MobileCustomRoleRetirementState {
  const result = mobileCustomRoleRetirementStateSchema.parse(value); assertCustomRoleRetirementScope(identity); assertTeamNoticesIdentity(identity, result.identity);
  if (result.roleId !== roleId) throw new Error('The retirement state belongs to another selected role.');
  return result;
}
