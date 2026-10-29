import { z } from 'zod';
import type { MobileIdentity } from '../contracts';
import { assertMemberRoleAssignmentScope, memberRoleAssignmentSnapshotSchema } from './member-role-assignment';
export const MOBILE_MEMBER_REMOVAL_MAX_BYTES = 32768;
export const mobileMemberRemovalRequestSchema = z.object({ version: z.literal(2), userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), requestNonce: z.uuid(),
  base: memberRoleAssignmentSnapshotSchema,
}).strict().refine(value => value.base.teamId === value.teamId, 'The saved member must belong to the selected team.');
export type MobileMemberRemovalRequest = z.infer<typeof mobileMemberRemovalRequestSchema>;
const receiptFields = { version: z.literal(2), request: mobileMemberRemovalRequestSchema, reason: z.null(), recordedAt: z.iso.datetime({ offset: true }) };
export const mobileMemberRemovalReceiptSchema = z.discriminatedUnion('status', [
  z.object({ ...receiptFields, status: z.literal('applied'), current: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('missing'), current: z.null() }).strict(),
  z.object({ ...receiptFields, status: z.literal('conflict'), current: memberRoleAssignmentSnapshotSchema }).strict(),
  z.object({ ...receiptFields, status: z.literal('blocked'), current: memberRoleAssignmentSnapshotSchema, reason: z.literal('related_records') }).strict(),
]).refine(value => {
  if (value.current === null) return true;
  if (value.current.id !== value.request.base.id || value.current.teamId !== value.request.teamId) return false;
  const same = JSON.stringify(value.current) === JSON.stringify(value.request.base);
  return value.status === 'blocked' ? same : !same;
}, 'The receipt must describe the changed or blocked member in the selected team.');
export type MobileMemberRemovalReceipt = z.infer<typeof mobileMemberRemovalReceiptSchema>;
export function assertMemberRemovalScope(identity: MobileIdentity, request: Pick<MobileMemberRemovalRequest, 'userId' | 'teamId' | 'memberId' | 'base'>) {
  try { assertMemberRoleAssignmentScope(identity, request); }
  catch { throw new Error('Current matching owner or admin with member-management authority may remove another non-owner membership.'); }
}
export function assertMobileMemberRemovalReceipt(identity: MobileIdentity, request: MobileMemberRemovalRequest, value: unknown): MobileMemberRemovalReceipt {
  request = mobileMemberRemovalRequestSchema.parse(request); const result = mobileMemberRemovalReceiptSchema.parse(value); assertMemberRemovalScope(identity, request);
  if (JSON.stringify(request) !== JSON.stringify(result.request)) throw new Error('The receipt belongs to another immutable member removal.');
  return result;
}
