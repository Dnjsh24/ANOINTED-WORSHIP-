import { z } from 'zod';
import { type MobileIdentity } from '../contracts';
import { mobileSettingsCustomRoleSchema } from './team-settings';

export const MOBILE_CUSTOM_ROLE_DELETE_MAX_BYTES = 32768;
export const mobileCustomRoleDeleteRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  base: mobileSettingsCustomRoleSchema,
}).strict().refine(value => value.base.teamId === value.teamId, 'The role must belong to the selected team.');
export type MobileCustomRoleDeleteRequest = z.infer<typeof mobileCustomRoleDeleteRequestSchema>;
const receiptFields = { version: z.literal(2), request: mobileCustomRoleDeleteRequestSchema, recordedAt: z.iso.datetime({ offset: true }) };
export const mobileCustomRoleDeleteReceiptSchema = z.discriminatedUnion('status', [
  z.object({ ...receiptFields, status: z.literal('applied'), current: z.null(), reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('missing'), current: z.null(), reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('conflict'), current: mobileSettingsCustomRoleSchema, reason: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('blocked'), current: mobileSettingsCustomRoleSchema, reason: z.literal('assigned_role') }).strict(),
]).refine(value => {
  if (value.current === null) return true;
  const base = value.request.base;
  if (value.current.id !== base.id || value.current.teamId !== base.teamId) return false;
  const same = JSON.stringify(value.current) === JSON.stringify(base);
  return value.status === 'blocked' ? same : !same;
}, 'The receipt must describe the exact role and outcome.');
export type MobileCustomRoleDeleteReceipt = z.infer<typeof mobileCustomRoleDeleteReceiptSchema>;
export function assertCustomRoleDeleteScope(identity: MobileIdentity, request: Pick<MobileCustomRoleDeleteRequest, 'userId' | 'teamId' | 'memberId'>) {
  if (request.userId !== identity.userId || request.teamId !== identity.teamId || request.memberId !== identity.memberId || identity.role !== 'owner' || !identity.permissions.includes('team.manage')) throw new Error('Current matching owner and team-management authority is required.');
}
export function assertMobileCustomRoleDeleteReceipt(identity: MobileIdentity, request: MobileCustomRoleDeleteRequest, value: unknown): MobileCustomRoleDeleteReceipt {
  request = mobileCustomRoleDeleteRequestSchema.parse(request); const result = mobileCustomRoleDeleteReceiptSchema.parse(value); assertCustomRoleDeleteScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request)) throw new Error('The receipt belongs to another immutable custom-role deletion.');
  return result;
}
