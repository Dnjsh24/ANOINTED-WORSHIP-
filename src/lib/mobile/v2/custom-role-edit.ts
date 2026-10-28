import { z } from 'zod';
import { type MobileIdentity } from '../contracts';
import { mobileSettingsCustomRoleSchema } from './team-settings';
import { mobileCustomRoleCreateRequestSchema } from './custom-role-create';

export const MOBILE_CUSTOM_ROLE_EDIT_MAX_BYTES = 32768;
export const mobileCustomRoleEditRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  base: mobileSettingsCustomRoleSchema, value: mobileCustomRoleCreateRequestSchema.pick({ name: true, permissions: true }),
}).strict().refine(value => value.base.teamId === value.teamId, 'The role must belong to the selected team.');
export type MobileCustomRoleEditRequest = z.infer<typeof mobileCustomRoleEditRequestSchema>;
const receiptFields = { version: z.literal(2), request: mobileCustomRoleEditRequestSchema, recordedAt: z.iso.datetime({ offset: true }) };
export const mobileCustomRoleEditReceiptSchema = z.discriminatedUnion('status', [
  z.object({ ...receiptFields, status: z.literal('applied'), current: mobileSettingsCustomRoleSchema, reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('missing'), current: z.null(), reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('conflict'), current: mobileSettingsCustomRoleSchema, reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('blocked'), current: mobileSettingsCustomRoleSchema, reason: z.literal('existing_role') }).strict(),
]).refine(value => {
  if (value.current === null) return true;
  const base = value.request.base;
  if (value.current.id !== base.id || value.current.teamId !== base.teamId) return false;
  const same = JSON.stringify(value.current) === JSON.stringify(base);
  if (value.status === 'blocked') return same;
  if (value.status === 'conflict') return !same;
  return value.current.createdAt === base.createdAt && value.current.name === value.request.value.name && JSON.stringify(value.current.permissions) === JSON.stringify(value.request.value.permissions);
}, 'The receipt must describe the exact role and outcome.');
export type MobileCustomRoleEditReceipt = z.infer<typeof mobileCustomRoleEditReceiptSchema>;
export function assertCustomRoleEditScope(identity: MobileIdentity, request: Pick<MobileCustomRoleEditRequest, 'userId' | 'teamId' | 'memberId'>) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId || identity.role !== 'owner' || !identity.permissions.includes('team.manage')) throw new Error('Current matching owner and team-management authority is required.');
}
export function assertMobileCustomRoleEditReceipt(identity: MobileIdentity, request: MobileCustomRoleEditRequest, value: unknown): MobileCustomRoleEditReceipt {
  request = mobileCustomRoleEditRequestSchema.parse(request); const result = mobileCustomRoleEditReceiptSchema.parse(value); assertCustomRoleEditScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request)) throw new Error('The receipt belongs to another immutable custom-role edit.');
  return result;
}
